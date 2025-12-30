/**
 * روش‌های جایگزین برای تولید تصویر صورتحساب
 * این فایل شامل چندین روش مختلف برای رندر کردن جدول به تصویر است
 */

import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ============================================
// روش 1: استفاده از dom-to-image (نیاز به نصب: npm install dom-to-image)
// ============================================
export const exportInvoiceWithDomToImage = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // نصب: npm install dom-to-image
        const domtoimage = await import('dom-to-image');
        
        const dataUrl = await domtoimage.toPng(invoiceElement, {
            quality: 1.0,
            width: invoiceElement.scrollWidth,
            height: invoiceElement.scrollHeight,
            style: {
                transform: 'scale(1)',
                transformOrigin: 'top left',
            },
            filter: (node: Node) => {
                // فیلتر کردن المان‌های نامرئی
                if (node instanceof HTMLElement) {
                    const style = window.getComputedStyle(node);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                }
                return true;
            }
        });
        
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err: any) {
        console.error('❌ [dom-to-image] Error:', err);
        throw err;
    }
};

// ============================================
// روش 2: استفاده از Canvas API مستقیم برای رسم جدول
// ============================================
export const exportInvoiceWithCanvasAPI = async (
    invoiceData: any,
    driverName: string
): Promise<void> => {
    try {
        // ایجاد Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');
        
        // تنظیم اندازه Canvas
        const padding = 40;
        const cellHeight = 40;
        const cellPadding = 10;
        const fontSize = 14;
        const fontFamily = 'Vazirmatn, Tahoma, sans-serif';
        
        // محاسبه عرض و ارتفاع مورد نیاز
        const maxWidth = 1400;
        let currentY = padding;
        
        // بارگذاری فونت
        await document.fonts.load(`${fontSize}px ${fontFamily}`);
        
        // تنظیم فونت
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        
        // رسم عنوان
        ctx.fillText(`صورتحساب راننده: ${driverName}`, maxWidth - padding, currentY);
        currentY += cellHeight * 2;
        
        // رسم جدول
        // اینجا باید منطق رسم جدول را پیاده‌سازی کنیم
        // برای سادگی، یک نمونه ساده می‌دهیم
        
        canvas.width = maxWidth;
        canvas.height = currentY + padding;
        
        // تبدیل به تصویر
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err: any) {
        console.error('❌ [Canvas API] Error:', err);
        throw err;
    }
};

// ============================================
// روش 3: استفاده از SVG برای رندر و سپس تبدیل به PNG
// ============================================
export const exportInvoiceWithSVG = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // ایجاد SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', invoiceElement.scrollWidth.toString());
        svg.setAttribute('height', invoiceElement.scrollHeight.toString());
        
        // تبدیل HTML به SVG foreignObject
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('width', '100%');
        foreignObject.setAttribute('height', '100%');
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        foreignObject.appendChild(clonedContent);
        svg.appendChild(foreignObject);
        
        // تبدیل SVG به Data URL
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        // بارگذاری SVG در Image و تبدیل به Canvas
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png', 1.0);
                
                const link = document.createElement('a');
                link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
                link.href = dataUrl;
                link.click();
                
                URL.revokeObjectURL(svgUrl);
            }
        };
        img.src = svgUrl;
    } catch (err: any) {
        console.error('❌ [SVG] Error:', err);
        throw err;
    }
};

// ============================================
// روش 4: استفاده از html2canvas با تنظیمات پیشرفته‌تر
// ============================================
export const exportInvoiceWithHtml2CanvasAdvanced = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // ایجاد container برای محتوای کامل
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = 'auto';
        container.style.minWidth = '1400px';
        container.style.backgroundColor = '#ffffff';
        container.style.padding = '20px';
        document.body.appendChild(container);
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        container.appendChild(clonedContent);
        
        // انتظار برای render
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // محاسبه اندازه واقعی
        const actualWidth = Math.max(container.scrollWidth, 1400);
        const actualHeight = container.scrollHeight;
        
        // استفاده از html2canvas با تنظیمات پیشرفته
        const canvas = await html2canvas(container, {
            scale: 3, // افزایش scale برای کیفیت بهتر
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: true, // فعال کردن logging برای debug
            width: actualWidth,
            height: actualHeight,
            windowWidth: actualWidth,
            windowHeight: actualHeight,
            onclone: async (clonedDoc) => {
                // اضافه کردن فونت
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block');
                    * {
                        font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
                        font-size: 14px !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
                
                // انتظار برای لود شدن فونت
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // اطمینان از نمایش تمام المان‌ها
                const allElements = clonedDoc.querySelectorAll('*');
                allElements.forEach((el) => {
                    if (el instanceof HTMLElement) {
                        el.style.visibility = 'visible';
                        el.style.opacity = '1';
                        el.style.display = el.style.display === 'none' ? 'block' : el.style.display;
                    }
                });
            }
        });
        
        // تبدیل به PNG
        const imgData = canvas.toDataURL('image/png', 1.0);
        
        // پاک کردن container
        document.body.removeChild(container);
        
        // دانلود
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
    } catch (err: any) {
        console.error('❌ [html2canvas Advanced] Error:', err);
        throw err;
    }
};

// ============================================
// روش 5: استفاده از jsPDF برای تولید PDF و سپس تبدیل به تصویر
// ============================================
export const exportInvoiceWithJsPDF = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // تبدیل HTML به Canvas
        const canvas = await html2canvas(invoiceElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
        });
        
        // ایجاد PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // اضافه کردن تصویر به PDF
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
        
        // ذخیره PDF
        pdf.save(`صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
        console.error('❌ [jsPDF] Error:', err);
        throw err;
    }
};

// ============================================
// روش 6: استفاده از Print API و سپس capture
// ============================================
export const exportInvoiceWithPrintAPI = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // ایجاد یک window جدید برای print
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            throw new Error('Cannot open print window');
        }
        
        // Clone کردن محتوا
        const clonedContent = invoiceElement.cloneNode(true) as HTMLElement;
        
        // نوشتن HTML به window جدید
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>صورتحساب</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
                    * {
                        font-family: 'Vazirmatn', 'Tahoma', sans-serif;
                        font-size: 14px;
                    }
                    body {
                        margin: 0;
                        padding: 20px;
                        direction: rtl;
                    }
                </style>
            </head>
            <body>
                ${clonedContent.outerHTML}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // انتظار برای load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // استفاده از html2canvas روی window جدید
        const canvas = await html2canvas(printWindow.document.body, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
        });
        
        // تبدیل به PNG
        const imgData = canvas.toDataURL('image/png', 1.0);
        
        // بستن window
        printWindow.close();
        
        // دانلود
        const link = document.createElement('a');
        link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = imgData;
        link.click();
    } catch (err: any) {
        console.error('❌ [Print API] Error:', err);
        throw err;
    }
};

// ============================================
// روش 7: استفاده از OffscreenCanvas (برای Worker)
// ============================================
export const exportInvoiceWithOffscreenCanvas = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    try {
        // بررسی پشتیبانی از OffscreenCanvas
        if (!window.OffscreenCanvas) {
            throw new Error('OffscreenCanvas not supported');
        }
        
        // ایجاد OffscreenCanvas
        const offscreen = new OffscreenCanvas(
            invoiceElement.scrollWidth,
            invoiceElement.scrollHeight
        );
        
        // استفاده از html2canvas برای تبدیل به canvas
        const canvas = await html2canvas(invoiceElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
        });
        
        // تبدیل به blob
        canvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `صورتحساب_${driverName}_${new Date().toISOString().split('T')[0]}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            }
        }, 'image/png', 1.0);
    } catch (err: any) {
        console.error('❌ [OffscreenCanvas] Error:', err);
        throw err;
    }
};

// ============================================
// تابع کمکی: تست همه روش‌ها
// ============================================
export const testAllMethods = async (
    invoiceElement: HTMLElement,
    driverName: string
): Promise<void> => {
    const methods = [
        { name: 'html2canvas Advanced', fn: exportInvoiceWithHtml2CanvasAdvanced },
        { name: 'SVG', fn: exportInvoiceWithSVG },
        { name: 'jsPDF', fn: exportInvoiceWithJsPDF },
        { name: 'Print API', fn: exportInvoiceWithPrintAPI },
    ];
    
    for (const method of methods) {
        try {
            console.log(`🧪 Testing method: ${method.name}`);
            await method.fn(invoiceElement, driverName);
            console.log(`✅ ${method.name} succeeded`);
            break; // اگر موفق شد، بقیه را تست نکن
        } catch (err) {
            console.error(`❌ ${method.name} failed:`, err);
            // ادامه به روش بعدی
        }
    }
};

