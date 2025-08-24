const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// CSV escaping utility
function escapeCSVField(field) {
  if (!field) return '';
  const str = String(field);
  // If contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function scrapeInvoices() {
  const headful = process.env.HEADFUL === 'true';
  
  const browser = await chromium.launch({ 
    headless: !headful,
    slowMo: headful ? 1000 : 0 
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Wire up console logging from page context for debugging
  page.on('console', msg => {
    console.log(`[PAGE] ${msg.type()}: ${msg.text()}`);
  });
  
  try {
    console.log('🚀 Navigating to Zoho Books Demo...');
    
    // Navigate with domcontentloaded instead of networkidle (better for SPAs)
    await page.goto('https://www.zoho.com/books/accounting-software-demo/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    console.log('⏳ Waiting for demo app to initialize...');
    
    // Check for iframe containing the actual demo app
    let workingPage = page;
    const iframe = await page.locator('iframe').first();
    
    if (await iframe.isVisible().catch(() => false)) {
      console.log('📦 Detected iframe, switching context...');
      workingPage = iframe.contentFrame();
      if (!workingPage) {
        throw new Error('Failed to access iframe content');
      }
    }
    
    // Wait for UI-driven indicators instead of arbitrary timeouts
    const bodyLocator = workingPage.locator('body');
    await bodyLocator.waitFor({ state: 'visible', timeout: 15000 });
    
    // Wait for navigation to be ready (look for specific UI elements)
    const navLocator = workingPage.locator('#main-nav-tab').or(
      workingPage.locator('nav[role="navigation"]').first()
    ).or(workingPage.locator('[class*="main-tab"], [class*="sidebar"]').first());
    await navLocator.waitFor({ state: 'visible', timeout: 15000 });
    
    console.log('✅ Demo app loaded, navigating to Sales → Invoices...');
    
    // Navigate using stable selectors from working version
    await workingPage.waitForSelector('a.collapsed.nav-link:has-text("Sales")', { timeout: 15000 });
    await workingPage.click('a.collapsed.nav-link:has-text("Sales")');
    
    // Wait for submenu to expand using deterministic wait
    await workingPage.waitForTimeout(1000);
    
    // Click on Invoices link
    await workingPage.waitForSelector('a[href="#/invoices"]:has-text("Invoices")', { timeout: 10000 });
    await workingPage.click('a[href="#/invoices"]:has-text("Invoices")');
    
    // Wait for invoice list/table to be visible (UI-driven)
    const tableLocator = workingPage.locator('table')
      .or(workingPage.locator('[class*="invoice"]'))
      .or(workingPage.locator('[class*="list"], [class*="grid"]'));
    
    await tableLocator.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Navigated to invoices page');
    
    console.log('💰 Collecting Paid and Partially Paid invoices...');
    
    const invoices = [];
    let currentPage = 1;
    
    while (true) {
      console.log(`📄 Processing page ${currentPage}...`);
      
      // Wait for table rows to be present
      const rowsLocator = workingPage.locator('table tbody tr')
        .or(workingPage.locator('[class*="invoice-row"], [class*="list-item"]'));
      
      await rowsLocator.first().waitFor({ state: 'visible', timeout: 10000 });
      
      // Extract invoices using improved parsing
      const pageResults = await workingPage.evaluate(() => {
        const results = {
          invoices: [],
          schemaInfo: {
            totalRows: 0,
            parsedRows: 0,
            errors: [],
            columnCount: 0,
            hasExpectedStructure: false,
            debug: {
              url: window.location.href,
              timestamp: new Date().toISOString()
            }
          }
        };
        
        // Find table with multiple fallback strategies
        const table = document.querySelector('table') || 
                     document.querySelector('[role="table"]') ||
                     document.querySelector('[class*="invoice-table"], [class*="list-table"]');
        
        if (!table) {
          results.schemaInfo.errors.push('No table or list structure found');
          return results;
        }
        
        // Get rows with multiple strategies
        const tableRows = Array.from(
          table.querySelectorAll('tbody tr') || 
          table.querySelectorAll('tr:not(:first-child)') ||
          table.querySelectorAll('[role="row"]') ||
          document.querySelectorAll('[class*="invoice-row"], [class*="list-item"]')
        );
        
        results.schemaInfo.totalRows = tableRows.length;
        
        if (tableRows.length === 0) {
          results.schemaInfo.errors.push('No table rows found');
          return results;
        }
        
        // Analyze structure from first row
        const firstRow = tableRows[0];
        const cells = Array.from(
          firstRow.querySelectorAll('td, th, [role="cell"], [class*="cell"], [class*="col"]')
        );
        
        results.schemaInfo.columnCount = cells.length;
        results.schemaInfo.hasExpectedStructure = cells.length >= 3;
        
        // Process each row with improved parsing
        tableRows.forEach((row, index) => {
          try {
            const cells = Array.from(
              row.querySelectorAll('td, [role="cell"], [class*="cell"], [class*="col"]')
            );
            
            if (cells.length < 3) {
              results.schemaInfo.errors.push(`Row ${index + 1}: Insufficient columns (${cells.length})`);
              return;
            }
            
            let invoiceId = '', customer = '', status = '', amount = '', paidAt = '';
            
            // Enhanced invoice ID extraction with multiple strategies
            for (let i = 0; i < Math.min(cells.length, 8); i++) {
              const cell = cells[i];
              
              // Strategy 1: Look for data attributes
              if (cell.hasAttribute('data-invoice-id') || cell.hasAttribute('data-id')) {
                invoiceId = cell.getAttribute('data-invoice-id') || cell.getAttribute('data-id');
                break;
              }
              
              // Strategy 2: Look for links with invoice IDs
              const link = cell.querySelector('a[href*="invoice"]');
              if (link) {
                const linkText = link.textContent?.trim();
                const idMatch = linkText?.match(/Invoice\s*#?\s*(\d+)/i) || linkText?.match(/(\d+)/);
                if (idMatch) {
                  invoiceId = `Invoice${idMatch[1]}`;
                  break;
                }
              }
              
              // Strategy 3: Text-based fallback
              const cellText = cell.textContent?.trim() || '';
              const invoiceMatch = cellText.match(/Invoice\s*#?\s*(\d+)/i);
              if (invoiceMatch) {
                invoiceId = `Invoice${invoiceMatch[1]}`;
                break;
              }
            }
            
            // Enhanced status detection
            for (let i = 0; i < Math.min(cells.length, 8); i++) {
              const cell = cells[i];
              
              // Look for status in data attributes or classes
              if (cell.hasAttribute('data-status')) {
                const statusAttr = cell.getAttribute('data-status');
                if (statusAttr.match(/(paid|partially)/i)) {
                  status = statusAttr;
                  break;
                }
              }
              
              // Look for status badges or spans
              const statusElement = cell.querySelector('[class*="status"], [class*="badge"], [class*="tag"]');
              if (statusElement) {
                const statusText = statusElement.textContent?.trim();
                const paidMatch = statusText?.match(/(Paid|Partially Paid)/i);
                if (paidMatch) {
                  status = paidMatch[0];
                  break;
                }
              }
              
              // Text-based fallback
              const cellText = cell.textContent?.trim() || '';
              const paidMatch = cellText.match(/(Paid|Partially Paid)/i);
              if (paidMatch) {
                status = paidMatch[0];
                break;
              }
            }
            
            // Skip non-paid invoices early
            if (!status || !status.toLowerCase().includes('paid')) {
              return; // Skip this row
            }
            
            // Enhanced amount extraction
            for (let i = 0; i < Math.min(cells.length, 8); i++) {
              const cell = cells[i];
              
              if (cell.hasAttribute('data-amount')) {
                amount = cell.getAttribute('data-amount').replace(/[$,]/g, '');
                break;
              }
              
              const cellText = cell.textContent?.trim() || '';
              const amountMatch = cellText.match(/\$?([\d,]+(?:\.\d{2})?)/);
              if (amountMatch && parseFloat(amountMatch[1].replace(/,/g, '')) > 0) {
                amount = amountMatch[1].replace(/,/g, '').replace(/\.00$/, '');
                break;
              }
            }
            
            // Enhanced customer name extraction
            for (let i = 0; i < Math.min(cells.length, 8); i++) {
              const cell = cells[i];
              
              if (cell.hasAttribute('data-customer')) {
                customer = cell.getAttribute('data-customer');
                break;
              }
              
              const cellText = cell.textContent?.trim() || '';
              // Look for customer in cells that don't contain invoice IDs, amounts, dates, or status
              if (cellText && 
                  cellText.length > 3 && 
                  !cellText.match(/Invoice\d+|\$[\d,]+|\d{1,2}[\s\/\-]|^(Paid|Partially Paid)$/i) &&
                  !cellText.match(/^\d{4}$/)) { // Skip years
                
                if (cellText.length > customer.length) {
                  customer = cellText;
                }
              }
            }
            
            // Date extraction
            for (let i = 0; i < Math.min(cells.length, 8); i++) {
              const cell = cells[i];
              
              if (cell.hasAttribute('data-date')) {
                paidAt = cell.getAttribute('data-date');
                break;
              }
              
              const cellText = cell.textContent?.trim() || '';
              const dateMatch = cellText.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
              if (dateMatch) {
                paidAt = dateMatch[0];
                break;
              }
            }
            
            // Validate and add invoice
            if (invoiceId && customer && status) {
              results.invoices.push({
                invoice_id: invoiceId,
                customer: customer,
                amount: amount || '0',
                paid_at: paidAt || '',
                status: status
              });
              results.schemaInfo.parsedRows++;
            } else {
              results.schemaInfo.errors.push(
                `Row ${index + 1}: Missing required fields - ID:${!!invoiceId} Customer:${!!customer} Status:${!!status}`
              );
            }
            
          } catch (error) {
            results.schemaInfo.errors.push(`Row ${index + 1}: ${error.message}`);
          }
        });
        
        return results;
      });
      
      // Enhanced schema drift detection with debugging
      const { invoices: newInvoices, schemaInfo } = pageResults;
      
      if (schemaInfo.errors.length > 3) {
        console.warn(`⚠️ HIGH ERROR RATE: ${schemaInfo.errors.length} errors on page ${currentPage}`);
        console.warn('First 3 errors:', schemaInfo.errors.slice(0, 3));
        
        // Capture debugging info on high error rate
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshot = await workingPage.screenshot({ 
            path: `debug-page-${currentPage}-${timestamp}.png`,
            fullPage: true 
          });
          
          const htmlContent = await workingPage.content();
          fs.writeFileSync(`debug-page-${currentPage}-${timestamp}.html`, htmlContent);
          
          console.log(`🐛 Debug files saved: debug-page-${currentPage}-${timestamp}.png/html`);
        } catch (debugError) {
          console.warn('Failed to capture debug info:', debugError.message);
        }
      }
      
      if (schemaInfo.totalRows > 0 && schemaInfo.parsedRows === 0) {
        console.error('🚨 SCHEMA DRIFT ALERT: Found rows but parsed 0 paid invoices');
        console.error('Schema info:', schemaInfo);
        
        // Capture full debugging info on complete failure
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          await workingPage.screenshot({ 
            path: `schema-drift-${timestamp}.png`,
            fullPage: true 
          });
          
          const htmlContent = await workingPage.content();
          fs.writeFileSync(`schema-drift-${timestamp}.html`, htmlContent);
          
          console.log(`🚨 Schema drift debug files saved: schema-drift-${timestamp}.png/html`);
        } catch (debugError) {
          console.warn('Failed to capture schema drift debug info:', debugError.message);
        }
        
        throw new Error('Schema drift detected: parsing completely failed');
      }
      
      // Deduplication
      const existingIds = new Set(invoices.map(inv => inv.invoice_id));
      const uniqueNewInvoices = newInvoices.filter(inv => !existingIds.has(inv.invoice_id));
      
      if (newInvoices.length !== uniqueNewInvoices.length) {
        console.log(`🔄 Deduped ${newInvoices.length - uniqueNewInvoices.length} duplicate invoices`);
      }
      
      invoices.push(...uniqueNewInvoices);
      console.log(`✅ Found ${uniqueNewInvoices.length} new paid invoices on page ${currentPage} (${schemaInfo.parsedRows} total parsed, ${schemaInfo.errors.length} errors)`);
      
      // Enhanced pagination with semantic selectors
      const nextButton = workingPage.getByRole('button', { name: /^next$/i })
        .or(workingPage.getByRole('button', { name: /next page/i }))
        .or(workingPage.locator('[aria-label*="Next"]'))
        .or(workingPage.locator('button:has-text("Next"), .pagination-next'));
      
      const isNextEnabled = await nextButton.isEnabled().catch(() => false);
      const isNextVisible = await nextButton.isVisible().catch(() => false);
      
      if (isNextVisible && isNextEnabled) {
        await nextButton.click();
        
        // Wait for new content to load using UI-driven approach
        const currentRowCount = await workingPage.locator('table tbody tr').count();
        await workingPage.waitForFunction(
          (prevCount) => {
            const newCount = document.querySelectorAll('table tbody tr').length;
            return newCount !== prevCount || newCount === 0;
          },
          currentRowCount,
          { timeout: 10000 }
        );
        
        currentPage++;
      } else {
        console.log('📄 No more pages to process');
        break;
      }
    }
    
    console.log(`🎉 Total invoices collected: ${invoices.length}`);
    
    // Final validation
    const invalidInvoices = invoices.filter(inv => 
      !inv.invoice_id || !inv.customer || !inv.status
    );
    
    if (invalidInvoices.length > 0) {
      console.error(`🚨 VALIDATION FAILED: ${invalidInvoices.length} invoices missing required fields`);
      throw new Error(`Data validation failed: ${invalidInvoices.length} invoices have missing required fields`);
    }
    
    if (invoices.length === 0) {
      console.warn('🚨 SCHEMA DRIFT ALERT: No paid invoices found - possible DOM structure change');
      
      // Capture debug info for zero results
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await workingPage.screenshot({ 
          path: `no-results-${timestamp}.png`,
          fullPage: true 
        });
        console.log(`🐛 No results debug screenshot: no-results-${timestamp}.png`);
      } catch (debugError) {
        console.warn('Failed to capture no-results debug screenshot');
      }
    }
    
    // Generate CSV with proper escaping
    if (invoices.length > 0) {
      const csvHeader = 'invoice_id,customer,amount,paid_at,status\n';
      const csvRows = invoices.map(invoice => 
        `${escapeCSVField(invoice.invoice_id)},${escapeCSVField(invoice.customer)},${escapeCSVField(invoice.amount)},${escapeCSVField(invoice.paid_at)},${escapeCSVField(invoice.status)}`
      ).join('\n');
      
      const csvContent = csvHeader + csvRows;
      const csvPath = path.join(__dirname, '..', 'invoices.csv');
      
      fs.writeFileSync(csvPath, csvContent);
      console.log(`💾 CSV file saved to: ${csvPath}`);
      console.log('📋 Sample data:');
      console.log(csvHeader + csvRows.split('\n').slice(0, 3).join('\n'));
    } else {
      console.log('⚠️ No paid invoices found');
    }
    
    // Demo mode handling
    if (headful) {
      console.log('🎬 DEMO MODE: Browser staying open for recording/inspection');
      console.log('⏸️  Press ENTER to close...');
      
      await new Promise((resolve) => {
        process.stdin.once('data', resolve);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during scraping:', error.message);
    
    // Capture error state for debugging
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({ 
        path: `error-${timestamp}.png`,
        fullPage: true 
      });
      console.log(`🐛 Error screenshot saved: error-${timestamp}.png`);
    } catch (screenshotError) {
      console.warn('Failed to capture error screenshot');
    }
    
    throw error;
  } finally {
    // Guarded browser close to prevent masking real errors
    try {
      await browser.close();
    } catch (closeError) {
      console.warn('Warning: Failed to close browser cleanly:', closeError.message);
    }
  }
}

// Export for testing
module.exports = { scrapeInvoices, escapeCSVField };

// Run if called directly
if (require.main === module) {
  scrapeInvoices()
    .then(() => {
      console.log('✨ Scraping completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Scraping failed:', error.message);
      process.exit(1);
    });
}