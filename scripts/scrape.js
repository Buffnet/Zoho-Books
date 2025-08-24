const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeInvoices() {
  const headful = process.env.HEADFUL === 'true';
  
  const browser = await chromium.launch({ 
    headless: !headful,
    slowMo: headful ? 1000 : 0 
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('🚀 Navigating to Zoho Books Demo...');
    
    // Navigate directly to Zoho Books Demo
    await page.goto('https://www.zoho.com/books/accounting-software-demo/', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for the demo app to fully initialize
    console.log('⏳ Waiting for demo app to fully load...');
    await page.waitForTimeout(5000); // Give time for JS to initialize
    
    // Wait for main navigation elements to be present
    await page.waitForFunction(() => {
      const body = document.body;
      return body && body.textContent.length > 1000; // Ensure content is loaded
    }, { timeout: 15000 });
    
    console.log('✅ Demo app loaded, navigating to Sales → Invoices...');
    
    // First, expand the Sales accordion menu
    await page.waitForSelector('a.collapsed.nav-link:has-text("Sales")', { timeout: 15000 });
    await page.click('a.collapsed.nav-link:has-text("Sales")');
    
    // Wait for the Sales submenu to expand
    await page.waitForTimeout(1000);
    
    // Click on Invoices link
    await page.waitForSelector('a[href="#/invoices"]:has-text("Invoices")', { timeout: 10000 });
    await page.click('a[href="#/invoices"]:has-text("Invoices")');
    
    // Wait for invoices page to load
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to invoices page');
    
    // Wait for invoice table to be visible
    await page.waitForSelector('table, .invoice-table, .list-view', { timeout: 15000 });
    
    console.log('💰 Collecting Paid and Partially Paid invoices...');
    
    const invoices = [];
    let currentPage = 1;
    
    while (true) {
      console.log(`📄 Processing page ${currentPage}...`);
      
      // Wait for table to be visible
      await page.waitForSelector('table tbody tr, .invoice-row', { timeout: 10000 });
      
      // Only show debug info in headful mode
      if (headful) {
        const pageInfo = await page.evaluate(() => {
          const table = document.querySelector('table');
          const rows = table ? Array.from(table.querySelectorAll('tbody tr')).slice(0, 3) : [];
          
          return {
            url: window.location.href,
            rowCount: document.querySelectorAll('table tbody tr').length,
            sampleRowsText: rows.map(row => row.textContent?.trim())
          };
        });
        
        console.log('🔍 Page debug info:');
        console.log('- URL:', pageInfo.url);
        console.log('- Row count:', pageInfo.rowCount);
        console.log('- Sample rows:', pageInfo.sampleRowsText);
      }
      
      // Extract invoices from current page using stable column selectors
      const pageInvoices = await page.evaluate(() => {
        const results = {
          invoices: [],
          schemaInfo: {
            totalRows: 0,
            parsedRows: 0,
            errors: [],
            columnCount: 0,
            hasExpectedStructure: false
          }
        };
        
        // Get table and analyze structure
        const table = document.querySelector('table');
        if (!table) {
          results.schemaInfo.errors.push('No table found');
          return results;
        }
        
        const tableRows = table.querySelectorAll('tbody tr');
        results.schemaInfo.totalRows = tableRows.length;
        console.log('Found rows:', tableRows.length);
        
        // Analyze table structure from first row
        if (tableRows.length > 0) {
          const firstRow = tableRows[0];
          const cells = firstRow.querySelectorAll('td, th');
          results.schemaInfo.columnCount = cells.length;
          results.schemaInfo.hasExpectedStructure = cells.length >= 4; // Minimum expected columns
          
          console.log('Table structure:', {
            columns: cells.length,
            sampleCellTexts: Array.from(cells).slice(0, 5).map(cell => cell.textContent?.trim())
          });
        }
        
        // Process each row using stable column-based extraction
        tableRows.forEach((row, index) => {
          try {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) {
              results.schemaInfo.errors.push(`Row ${index + 1}: Insufficient columns (${cells.length})`);
              return;
            }
            
            // Extract data using column positions (more stable than regex)
            // Common table structure: [Date, Invoice, Customer, Status, Amount, ...]
            let invoiceId = '', customer = '', status = '', amount = '', paidAt = '';
            
            // Try to find invoice ID in any cell (fallback to regex if needed)
            for (let i = 0; i < Math.min(cells.length, 6); i++) {
              const cellText = cells[i].textContent?.trim() || '';
              const invoiceMatch = cellText.match(/Invoice\d+/i);
              if (invoiceMatch) {
                invoiceId = invoiceMatch[0];
                break;
              }
            }
            
            // Try to find paid status in any cell (filter early for efficiency)
            for (let i = 0; i < Math.min(cells.length, 6); i++) {
              const cellText = cells[i].textContent?.trim() || '';
              const paidMatch = cellText.match(/(Paid|Partially Paid)/i);
              if (paidMatch) {
                status = paidMatch[0];
                break;
              }
            }
            
            // Try to find amount in any cell
            for (let i = 0; i < Math.min(cells.length, 6); i++) {
              const cellText = cells[i].textContent?.trim() || '';
              const amountMatch = cellText.match(/\$?[\d,]+(?:\.\d{2})?/);
              if (amountMatch && parseFloat(amountMatch[0].replace(/[$,]/g, '')) > 0) {
                amount = amountMatch[0].replace(/[$,]/g, '').replace(/\.00$/, '');
                break;
              }
            }
            
            // Try to find customer name (usually longest non-numeric text)
            let longestText = '';
            for (let i = 0; i < Math.min(cells.length, 6); i++) {
              const cellText = cells[i].textContent?.trim() || '';
              // Skip cells that look like invoices, amounts, dates, or status
              if (!cellText.match(/Invoice\d+|\$[\d,]+|\d{1,2}[\s\/\-]|^(Paid|Partially Paid)$/i)) {
                if (cellText.length > longestText.length && cellText.length > 3) {
                  longestText = cellText;
                }
              }
            }
            customer = longestText.replace(/[^\w\s.-]/g, '').trim();
            
            // Try to find date in any cell
            for (let i = 0; i < Math.min(cells.length, 6); i++) {
              const cellText = cells[i].textContent?.trim() || '';
              const dateMatch = cellText.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/);
              if (dateMatch) {
                paidAt = dateMatch[0];
                break;
              }
            }
            
            console.log(`Row ${index + 1} parsed:`, { invoiceId, customer, status, amount, paidAt });
            
            // Validate required fields and filter for paid invoices
            if (invoiceId && customer && status && status.toLowerCase().includes('paid')) {
              results.invoices.push({
                invoice_id: invoiceId,
                customer: customer,
                amount: amount || '0',
                paid_at: paidAt,
                status: status
              });
              results.schemaInfo.parsedRows++;
            } else if (status && status.toLowerCase().includes('paid')) {
              // Track failed parses for paid invoices
              results.schemaInfo.errors.push(`Row ${index + 1}: Missing required fields - ID:${!!invoiceId} Customer:${!!customer} Status:${!!status}`);
            }
            
          } catch (error) {
            results.schemaInfo.errors.push(`Row ${index + 1}: ${error.message}`);
          }
        });
        
        return results;
      });
      
      // Process results and detect schema drift
      const { invoices: newInvoices, schemaInfo } = pageInvoices;
      
      // Schema drift detection
      if (schemaInfo.errors.length > 3) {
        console.warn(`⚠️ HIGH ERROR RATE: ${schemaInfo.errors.length} errors on page ${currentPage}`);
        console.warn('First 3 errors:', schemaInfo.errors.slice(0, 3));
      }
      
      if (schemaInfo.totalRows > 0 && schemaInfo.parsedRows === 0) {
        console.error('🚨 SCHEMA DRIFT ALERT: Found rows but parsed 0 paid invoices');
        console.error('Schema info:', schemaInfo);
        throw new Error('Schema drift detected: parsing completely failed');
      }
      
      if (!schemaInfo.hasExpectedStructure) {
        console.warn(`⚠️ Unexpected table structure: ${schemaInfo.columnCount} columns`);
      }
      
      // Deduplicate by invoice_id before adding
      const existingIds = new Set(invoices.map(inv => inv.invoice_id));
      const uniqueNewInvoices = newInvoices.filter(inv => !existingIds.has(inv.invoice_id));
      
      if (newInvoices.length !== uniqueNewInvoices.length) {
        console.log(`🔄 Deduped ${newInvoices.length - uniqueNewInvoices.length} duplicate invoices`);
      }
      
      invoices.push(...uniqueNewInvoices);
      console.log(`✅ Found ${uniqueNewInvoices.length} new paid invoices on page ${currentPage} (${schemaInfo.parsedRows} total parsed, ${schemaInfo.errors.length} errors)`);
      
      // Check for next page button and click if exists
      const nextButton = await page.$('button:has-text("Next"), .pagination-next, [aria-label="Next"]');
      if (nextButton && await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Wait for new data to load
        currentPage++;
      } else {
        console.log('📄 No more pages to process');
        break;
      }
    }
    
    console.log(`🎉 Total invoices collected: ${invoices.length}`);
    
    // Final validation: fail fast if required columns are missing
    const invalidInvoices = invoices.filter(inv => 
      !inv.invoice_id || !inv.customer || !inv.status
    );
    
    if (invalidInvoices.length > 0) {
      console.error(`🚨 VALIDATION FAILED: ${invalidInvoices.length} invoices missing required fields`);
      console.error('Sample invalid:', invalidInvoices.slice(0, 3));
      throw new Error(`Data validation failed: ${invalidInvoices.length} invoices have missing required fields`);
    }
    
    if (invoices.length === 0) {
      console.warn('🚨 SCHEMA DRIFT ALERT: No paid invoices found - possible DOM structure change');
    }
    
    // Generate CSV
    if (invoices.length > 0) {
      const csvHeader = 'invoice_id,customer,amount,paid_at,status\n';
      const csvRows = invoices.map(invoice => 
        `"${invoice.invoice_id}","${invoice.customer}","${invoice.amount}","${invoice.paid_at}","${invoice.status}"`
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
    
    // In headful mode, keep browser open for demo/video
    if (headful) {
      console.log('🎬 DEMO MODE: Browser staying open for recording/inspection');
      console.log('📄 You can now see the invoices page and the data collected');
      console.log('⏸️  Press ENTER to close the browser and complete the scraping...');
      
      // Wait for user input in headful mode
      await new Promise((resolve) => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
      
      console.log('✅ Demo completed, closing browser...');
    }
    
  } catch (error) {
    console.error('❌ Error during scraping:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the scraper
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

module.exports = { scrapeInvoices };