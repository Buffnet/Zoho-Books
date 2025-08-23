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
      
      // Extract invoices from current page
      const pageInvoices = await page.evaluate(() => {
        const rows = [];
        
        // Get table rows
        const tableRows = document.querySelectorAll('table tbody tr');
        console.log('Found rows:', tableRows.length);
        
        tableRows.forEach((row, index) => {
          try {
            // Get the full text content of the row
            const rowText = row.textContent.trim();
            console.log(`Row ${index + 1}: "${rowText}"`);
            
            // Check if row contains "Paid" or "Partially Paid"
            if (rowText.toLowerCase().includes('paid')) {
              
              // Parse the row text - expected format:
              // "17 Apr 2025Invoice2    Dr. Lawrence Robel Partially Paid14 Jan 2026$43404$43394"
              
              // Try to extract invoice ID (InvoiceN pattern)
              const invoiceMatch = rowText.match(/Invoice(\d+)/);
              const invoiceId = invoiceMatch ? invoiceMatch[0] : '';
              
              // Extract status with fallback patterns
              const statusPatterns = [
                /(Draft|Paid|Partially Paid|Overdue|Pending|Approved|Void|Open)/i,
                /status[:\s]+(Draft|Paid|Partially Paid|Overdue|Pending|Approved|Void|Open)/i
              ];
              
              let status = '';
              let statusMatch = null;
              for (const pattern of statusPatterns) {
                statusMatch = rowText.match(pattern);
                if (statusMatch) {
                  status = statusMatch[1] || statusMatch[0];
                  break;
                }
              }
              
              // Extract customer name with improved logic
              let customer = '';
              if (invoiceMatch && statusMatch) {
                const afterInvoice = rowText.substring(rowText.indexOf(invoiceMatch[0]) + invoiceMatch[0].length).trim();
                const statusIndex = afterInvoice.search(statusMatch[0]);
                if (statusIndex > 0) {
                  customer = afterInvoice.substring(0, statusIndex).trim();
                  // Clean up customer name (remove extra spaces, special chars)
                  customer = customer.replace(/\s+/g, ' ').replace(/[^\w\s.-]/g, '').trim();
                }
              }
              
              // Extract amount with improved currency normalization
              const amountMatches = rowText.match(/\$[\d,]+(\.\d{2})?/g);
              let amount = '';
              if (amountMatches && amountMatches.length > 0) {
                // Take the last amount (usually the balance due)
                amount = amountMatches[amountMatches.length - 1]
                  .replace(/[$,]/g, '')  // Remove $ and commas
                  .replace(/\.00$/, '')  // Remove trailing .00
                  .trim();
              }
              
              // Extract date with multiple format support
              let paidAt = '';
              const datePatterns = [
                /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/,
                /\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/,
                /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/
              ];
              
              for (const pattern of datePatterns) {
                const dateMatch = rowText.match(pattern);
                if (dateMatch) {
                  paidAt = dateMatch[0];
                  break;
                }
              }
              
              console.log('Parsed data:', { invoiceId, customer, status, amount, paidAt });
              
              if (invoiceId && customer && status.toLowerCase().includes('paid')) {
                rows.push({
                  invoice_id: invoiceId,
                  customer: customer,
                  amount: amount,
                  paid_at: paidAt,
                  status: status
                });
              }
            }
          } catch (error) {
            console.log('Error processing row:', error.message);
          }
        });
        
        return rows;
      });
      
      invoices.push(...pageInvoices);
      console.log(`✅ Found ${pageInvoices.length} paid invoices on page ${currentPage}`);
      
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