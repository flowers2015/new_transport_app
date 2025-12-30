/**
 * نسخه بهبود یافته exportInvoiceToImage با روش‌های جایگزین
 * این فایل شامل چندین روش مختلف برای رندر کردن جدول به تصویر است
 */

import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * روش 1: استفاده از html2canvas با روش جدید - رندر مستقیم بدون clone
 */
export const exportInvoiceToImageMethod1 = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🔄 [Method 1] Starting export with direct rendering...');
        
        // ایجاد یک container جدید در صفحه اصلی (نه off-screen)
        const container = document.createElement('div');
        container.id = 'invoice-export-container';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: white;
            z-index: 999999;
            overflow: auto;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        
        // اعمال استایل‌های لازم به cloned content
        clonedContent.style.cssText = `
            width: auto;
            min-width: 1400px;
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            direction: rtl;
        `;
        
        container.appendChild(clonedContent);
        document.body.appendChild(container);
        
        // انتظار برای render کامل
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // محاسبه اندازه واقعی
        const actualWidth = Math.max(clonedContent.scrollWidth, 1400);
        const actualHeight = clonedContent.scrollHeight;
        
        console.log(`📐 [Method 1] Dimensions: ${actualWidth}x${actualHeight}`);
        
        // استفاده از html2canvas روی container
        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: actualWidth,
            height: actualHeight,
            windowWidth: actualWidth,
            windowHeight: actualHeight,
            scrollX: 0,
            scrollY: 0,
        });
        
        // پاک کردن container
        document.body.removeChild(container);
        
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas is empty');
        }
        
        // تبدیل به PNG
        const imgData = canvas.toDataURL('image/png', 1.0);
        
        // دانلود
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
        
        console.log('✅ [Method 1] Export completed successfully');
    } catch (err: any) {
        console.error('❌ [Method 1] Error:', err);
        throw err;
    }
};

/**
 * روش 2: استفاده از SVG foreignObject برای رندر کامل
 */
export const exportInvoiceToImageMethod2 = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🔄 [Method 2] Starting export with SVG...');
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        
        // اعمال استایل‌های لازم
        clonedContent.style.cssText = `
            width: auto;
            min-width: 1400px;
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            direction: rtl;
            font-family: 'Vazirmatn', 'Tahoma', sans-serif;
        `;
        
        // محاسبه اندازه
        const width = Math.max(clonedContent.scrollWidth, 1400);
        const height = clonedContent.scrollHeight;
        
        // ایجاد SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', width.toString());
        svg.setAttribute('height', height.toString());
        
        // ایجاد foreignObject
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('width', '100%');
        foreignObject.setAttribute('height', '100%');
        foreignObject.appendChild(clonedContent);
        svg.appendChild(foreignObject);
        
        // تبدیل SVG به Data URL
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        // بارگذاری SVG در Image
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = () => {
                // ایجاد Canvas
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }
                
                // رسم تصویر روی Canvas
                ctx.drawImage(img, 0, 0);
                
                // تبدیل به PNG
                const dataUrl = canvas.toDataURL('image/png', 1.0);
                
                // دانلود
                const link = document.createElement('a');
                link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
                link.href = dataUrl;
                link.click();
                
                URL.revokeObjectURL(svgUrl);
                resolve(undefined);
            };
            img.onerror = reject;
            img.src = svgUrl;
        });
        
        console.log('✅ [Method 2] Export completed successfully');
    } catch (err: any) {
        console.error('❌ [Method 2] Error:', err);
        throw err;
    }
};

/**
 * روش 3: استفاده از html2canvas با iframe برای isolation کامل
 */
export const exportInvoiceToImageMethod3 = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🔄 [Method 3] Starting export with iframe...');
        
        // ایجاد iframe
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            width: 1600px;
            height: 10000px;
            border: none;
        `;
        document.body.appendChild(iframe);
        
        // انتظار برای load شدن iframe
        await new Promise((resolve) => {
            iframe.onload = resolve;
            iframe.src = 'about:blank';
        });
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            throw new Error('Cannot access iframe document');
        }
        
        // نوشتن HTML به iframe
        iframeDoc.open();
        iframeDoc.write(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block');
                    * {
                        font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                        font-size: 14px !important;
                        box-sizing: border-box;
                    }
                    body {
                        margin: 0;
                        padding: 20px;
                        background: white;
                        direction: rtl;
                    }
                </style>
            </head>
            <body>
                ${invoiceElement.outerHTML}
            </body>
            </html>
        `);
        iframeDoc.close();
        
        // انتظار برای render کامل
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // استفاده از html2canvas روی iframe body
        const canvas = await html2canvas(iframeDoc.body, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
        });
        
        // پاک کردن iframe
        document.body.removeChild(iframe);
        
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas is empty');
        }
        
        // تبدیل به PNG
        const imgData = canvas.toDataURL('image/png', 1.0);
        
        // دانلود
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
        
        console.log('✅ [Method 3] Export completed successfully');
    } catch (err: any) {
        console.error('❌ [Method 3] Error:', err);
        throw err;
    }
};

/**
 * روش 4: استفاده از jsPDF برای تولید PDF (که می‌تواند به تصویر تبدیل شود)
 */
export const exportInvoiceToImageMethod4 = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        console.log('🔄 [Method 4] Starting export with jsPDF...');
        
        // تبدیل HTML به Canvas
        const canvas = await html2canvas(invoiceElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
        });
        
        // ایجاد PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const pageHeight = 297; // A4 height in mm
        
        let heightLeft = imgHeight;
        let position = 0;
        
        // اضافه کردن تصویر به PDF
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // اضافه کردن صفحات اضافی در صورت نیاز
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        // ذخیره PDF
        pdf.save(`صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.pdf`);
        
        console.log('✅ [Method 4] Export completed successfully');
    } catch (err: any) {
        console.error('❌ [Method 4] Error:', err);
        throw err;
    }
};

/**
 * تابع اصلی: تست همه روش‌ها به ترتیب تا یکی موفق شود
 */
export const exportInvoiceToImageImproved = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    const methods = [
        { name: 'Method 1 (Direct Render)', fn: exportInvoiceToImageMethod1 },
        { name: 'Method 3 (Iframe)', fn: exportInvoiceToImageMethod3 },
        { name: 'Method 2 (SVG)', fn: exportInvoiceToImageMethod2 },
        { name: 'Method 4 (PDF)', fn: exportInvoiceToImageMethod4 },
    ];
    
    for (const method of methods) {
        try {
            console.log(`🧪 Trying ${method.name}...`);
            await method.fn(invoiceElement, driverName);
            console.log(`✅ ${method.name} succeeded!`);
            return; // اگر موفق شد، بقیه را تست نکن
        } catch (err) {
            console.error(`❌ ${method.name} failed:`, err);
            // ادامه به روش بعدی
        }
    }
    
    throw new Error('All methods failed');
};

