
import React, { useState, useMemo, useEffect } from 'react';
import { Vehicle, Branch, PlateNumber, VehicleStatus, VehicleCategory } from '../../types';
import { TruckIcon } from '../icons/CarIcon';
import { formatJalali, formatPlateNumber } from '../../utils/jalali';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';
import VehicleSpecsDialog from '../VehicleSpecsDialog';
import VehicleFormDialog from '../VehicleFormDialog';
import { getApiUrl } from '../../utils/apiConfig';

interface VehicleManagementProps {
    vehicles: Vehicle[];
    branches: Branch[];
    onAddVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
    onUpdateVehicle?: (id: string, vehicle: Omit<Vehicle, 'id'>) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
}

const persianAlphabet = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی'];
const iranianProvinces = ["آذربایجان شرقی", "آذربایجان غربی", "اردبیل", "اصفهان", "البرز", "ایلام", "بوشهر", "تهران", "چهارمحال و بختیاری", "خراسان جنوبی", "خراسان رضوی", "خراسان شمالی", "خوزستان", "زنجان", "سمنان", "سیستان و بلوچستان", "فارس", "قزوین", "قم", "کردستان", "کرمان", "کرمانشاه", "کهگیلویه و بویراحمد", "گلستان", "گیلان", "لرستان", "مازندران", "مرکزی", "هرمزگان", "همدان", "یزد"];
const mihanCompanies = ['پخش سراسری میهن', 'شهرنوشیدنی', 'پاندا', 'کارخانه میهن'];
const vehicleCategories = Object.values(VehicleCategory);
const fuelTypes = ['بنزینی', 'گازوییلی', 'برقی', 'هیبریدی', 'گازی'];
const vehicleColors = ["سفید", "نقره ای", "خاکستری-متالیک", "مشکی", "قرمز", "بژ روشن", "نوک مدادی", "قهوه ای-متالیک", "آبی", "سبز", "نقره آبی"];

const vehicleDatabase: any = {
  [VehicleCategory.Heavy]: {
    'اسکانیا': {
      'سری G': {
        'G380': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن', type: 'کشنده' },
        'G400': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن' },
        'G410': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن', type: 'کشنده' },
        'G460': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 3, wheelCount: 10, capacity: '41 تن' },
      },
      'سری P': {
         'P340': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '19.5 تن', type: '10چرخ' },
      },
      'سری R': {
        'R420': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن', type: 'کشنده' },
        'R440': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن' },
        'R450': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن' },
        'R460': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '42 تن' },
        'R560 (V8)': { fuelType: 'گازوییلی', cylinderCount: 8, axleCount: 2, wheelCount: 6, capacity: '42 تن' },
      },
      'سری S': {
        'S500': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن' },
      }
    },
    'ولوو': {
      'FH': {
        'FH500': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن' },
        'FH460': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن' },
      },
      'FMX': {
        '460': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 4, wheelCount: 10, capacity: '32 تن' }
      }
    },
    'بنز': {
        'آکتروس': { '1844': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '40 تن' } },
        'آکسور': { '1843': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '40 تن' } },
        'ال اس1924': { '-': {} },
        'ال1924': { '-': {} },
        'اتکو2628': { '-': { type: 'سقف کوتاه داراي اتاق خواب کاميون 30 تني' } },
        'ال کا 1924': { '-': {} },
        'ال1929': { '-': { type: 'تانکرحمل شير' } },
    },
    'داف': { 'XF': { '105': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن' } } },
    'C&C': {
        'U480': {'-': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن' } },
        'U420 (باری)': {'-': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 3, wheelCount: 10, capacity: '26 تن' } },
        'N120-N-AT': { '-': {} },
        'Y120-N-AT': { '-': {} },
        'Y120': { 'اتوماتيک': {} },
        'CC02-AT': { '-': { type: '10چرخ' } },
    },
    'رنو': {
        'سری K': { 'K480': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '19 تن' } },
        'پريميوم': { '440': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن', type: 'کاميون' } },
        'سری T': { 
            'T480': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '44 تن', type: 'کاميون' },
            'T520': { '-': { type: 'کاميون' } },
            'T460': { '-': { type: 'کاميون' } },
        },
    },
    'خاور': {
        '813': { '813': {} },
        '608': { '-': {} },
    },
    'ماک': {
        'MH613': { '-': {} },
    }
  },
  [VehicleCategory.Medium]: {
    'رنو': {
        'میدلام': { '270': { fuelType: 'گازوییلی', cylinderCount: 6, axleCount: 2, wheelCount: 6, capacity: '18 تن' } },
    },
    'گروه بهمن': { 'ون اینرودز': { 'دنده ای': {}, 'دنده ای ': {} } },
    'ایسوزو': {
        '5 تن': { 'NKR': {}, 'NKR 77': {}, 'NKR55': {} },
        '6 تن': { 'NPR70L': {}, 'NPR 75P': {}, 'NPR 75K': {}, 'NPR70': {} },
        '8 تن': { 'NQR': {} }
    },
    'فوسو': {
        '5 تن': { '-': {} },
        '6 تن': { 'بلند': {}, 'کوتاه': {} }
    }
  },
  [VehicleCategory.Car]: {
    'اسکای‌ول': { 'ET5': { 'برقی': {} } },
    'اشکودا': {
        'کاروک': { '1400 توربو': {} },
        'سوپرب': { 'توربو 1400': {} },
        'اوکتاویا': { 'توربو 1400': {} }
    },
    'اکستریم': {
        'VX': { 'توربو 2000': {} },
        'TXL': { 'توربو 2000': {} },
        'LX': { 'توربو 1600': {} }
    },
    'آئودی': {
        'A4 B9': {'-': {enginePower: 190, torque: 320, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TFSI', gearboxModel: '۷ سرعته اتوماتیک', gearCount: 7, length: 4762, width: 1847, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۳,۵۰۰-۴,۵۰۰', advantages: 'لوکس، ایمنی بالا', disadvantages: 'قطعات گران', leasingConditions: 'تا ۲۴ ماه از لیزینگ'}},
        'Q5': {'-': {enginePower: 252, torque: 370, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TFSI', gearboxModel: '۷ سرعته', gearCount: 7, length: 4663, width: 1898, netWeight: 1750, brakeSystem: 'دیسکی، ESP', marketPrice: '۴,۰۰۰-۵,۰۰۰', advantages: 'آفرود شهری، جادار', disadvantages: 'مصرف بالا', leasingConditions: 'تا ۲۴ ماه'}},
        'Q5 E-tron': { 'تیپ 40- فول': {}, 'تیپ 40- نیمه‌ فول': {} }
    },
    'آلفارومئو': {
        'Giulia': {'-': {enginePower: 280, torque: 400, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲.۰T', gearboxModel: '۸ سرعته', gearCount: 8, length: 4633, width: 1860, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۵,۰۰۰-۶,۰۰۰', advantages: 'اسپرت، طراحی ایتالیایی', disadvantages: 'خدمات محدود', leasingConditions: '- (نقدی)'}},
    },
    'آمیکو': {}, 'اپل': {},
    'اس دبلیو ام': {
        'G01F': {'-': {enginePower: 122, torque: 190, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۱.۵T', gearboxModel: 'CVT', length: 4420, width: 1830, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۹۰۰-۱,۲۰۰', advantages: 'اقتصادی، کراس کوچک', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۲۴ ماه از رامک'}},
    },
    'ام جی': {
        '۶': {'-': {enginePower: 169, torque: 250, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۱.۵T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4655, width: 1820, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۲۰۰-۱,۵۰۰', advantages: 'لوکس سدان، کروز', disadvantages: 'شتاب متوسط', leasingConditions: 'تا ۲۴ ماه از صبا باتری'}},
        'RX5': {'-': {enginePower: 169, torque: 250, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۱.۵T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4554, width: 1875, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۴۰۰-۱,۷۰۰', advantages: 'جادار، سانروف', disadvantages: 'خدمات محدود', leasingConditions: 'تا ۲۴ ماه'}},
        'ام جی GT': { 'توربو 1500': {} }, 
        'ام جی 5': { 'موتور 1500': {} }
    },
    'ایران خودرو': {
        'پژو ۲۰۶ تیپ ۵': {'-': {enginePower: 105, torque: 142, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'TU5', gearboxModel: 'دستی', gearCount: 5, length: 3822, width: 1652, netWeight: 1055, brakeSystem: 'دیسکی، ABS', marketPrice: '۴۵۰-۵۰۰', advantages: 'مانور شهری', disadvantages: 'فضای محدود', leasingConditions: 'تا ۳۶ ماه از IKCO'}},
        'دنا پلاس توربو': {'-': {enginePower: 150, torque: 215, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'EF7T', gearboxModel: 'دستی', gearCount: 5, length: 4558, width: 1735, netWeight: 1250, brakeSystem: 'دیسکی، EBD', marketPrice: '۷۰۰-۷۵۰', advantages: 'شتاب بالا', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۳۶ ماه'}},
        'تارا V4': {'-': {enginePower: 150, torque: 215, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'EF7P', gearboxModel: 'دستی', gearCount: 5, length: 4540, width: 1786, netWeight: 1300, brakeSystem: 'دیسکی، EBD', marketPrice: '۸۵۰-۹۰۰', advantages: 'مدرن، ESC', disadvantages: 'داخلی متوسط', leasingConditions: 'تا ۳۶ ماه'}},
        'سورن': { 'پلاس ': {}, 'پلاس': {}, 'پلاس دوگانه سوز': {}, 'پلاس XU7P': {} },
        'پژو پارس': {
            'معمولی - موتور جدید': {},
            'LX با دریچه گاز سیمی': {},
            'LX با دریچه گاز برقی ': {},
            'معمولی (سفارشی) - موتور جدید-ELX': {}
        },
        'پژو 2008': { 'اتوماتیک': {} },
        'ری‌را': { 'بنزینی': {} },
        'دنا پلاس ': {
            'توربو اتوماتیک - آپشنال': {},
            'توربو اتوماتیک - ESP': {},
            'توربو 6 دنده ': {},
            '6 دنده': {},
            'لو آپشن': {}
        },
        'تارا': {
            'اتومات V4': {},
            'اتوماتیک': {},
            'دنده ای V1 پلاس': {},
            'دنده - ESP': {}
        },
        'پژو 207': {
            'اتوماتیک سقف شیشه ای - ESP ارتقا یافته': {},
            'اتوماتیک سقف شیشه ای - ESP': {},
            'اتوماتیک سقف شیشه ای': {},
            'اتوماتیک - ESP': {},
            'دنده ای سقف شیشه ای - ESP ارتقا یافته': {},
            'دنده ای سقف شیشه ای - ESP ارتقا یافته- رینگ فولادی': {},
            'دنده ای نیمه فول - ESP': {},
            'دنده ای سقف شیشه ای - ESP': {},
            'دنده ای با موتور  ESP - TU3': {}
        },
        'لونا GRE': { 'برقی': {} },
        'رانا': {
            'پلاس سقف شیشه ای - ESP': {},
            'پلاس - ESP ارتقا یافته': {},
            ' پلاس - ESP': {}
        },
        'پژو 206': { 'تیپ 3': {} }
    },
    'بایک': {
        'X35': {'-': {enginePower: 149, torque: 210, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'BJ485ZQZ', gearboxModel: 'CVT', length: 4310, width: 1830, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۸۰۰-۱,۰۰۰', advantages: 'کراس اقتصادی', disadvantages: 'آپشن پایه', leasingConditions: 'تا ۲۴ ماه از فردا موتورز'}},
        'بیجینگ X7': { 'توربو 1500': {} }, 
        'بیجینگ X55': { 'توربو 1500': {} }
    },
    'برلیانس': {
        'H330': {'-': {enginePower: 136, torque: 170, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: 'BMDS', gearboxModel: 'دستی', gearCount: 5, length: 4470, width: 1725, netWeight: 1300, brakeSystem: 'دیسکی', marketPrice: '۳۰۰-۴۰۰', advantages: 'ارزان', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
    },
    'بسترن': {
        'B70': {'-': {enginePower: 163, torque: 250, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'CA4GA1', gearboxModel: '۶ سرعته', gearCount: 6, length: 4700, width: 1820, netWeight: 1500, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۱۰۰-۱,۴۰۰', advantages: 'جادار سدان', disadvantages: 'طراحی قدیمی', leasingConditions: 'تا ۲۴ ماه از بهمن'}},
        'بسترن B30': { 'اتوماتیک': {} }
    },
    'بستیون': { 'T77': { 'توربو 1500': {} }, 'نات': { 'برقی': {} } },
    'بک': { 'X3': { 'پرو': {} } },
    'بنز': {
        'C-Class W205': {'-': {enginePower: 184, torque: 300, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'M274', gearboxModel: '۹ سرعته', gearCount: 9, length: 4686, width: 1810, netWeight: 1550, brakeSystem: 'دیسکی، ESP', marketPrice: '۴,۵۰۰-۶,۰۰۰', advantages: 'لوکس، ایمنی', disadvantages: 'قطعات گران', leasingConditions: 'تا ۲۴ ماه از ستایش'}},
        'GLE': {'-': {enginePower: 255, torque: 365, emissionStandard: 'Euro 6', cylinderCount: 6, engineModel: 'M276', gearboxModel: '۹ سرعته', gearCount: 9, length: 4924, width: 1995, netWeight: 2200, brakeSystem: 'دیسکی، ABS', marketPrice: '۷,۰۰۰-۹,۰۰۰', advantages: 'آفرود لوکس', disadvantages: 'مصرف بالا', leasingConditions: 'تا ۲۴ ماه'}},
    },
    'بورگوارد': {
        'BX7': {'-': {enginePower: 227, torque: 380, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲.۰T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4770, width: 1910, netWeight: 1800, brakeSystem: 'دیسکی، ESP', marketPrice: '۱,۵۰۰-۲,۰۰۰', advantages: 'SUV جادار', disadvantages: 'خدمات ضعیف', leasingConditions: 'تا ۲۴ ماه از آرین'}},
    },
    'بی ام و': {
        '۳۲۰i': {'-': {enginePower: 184, torque: 290, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'B48', gearboxModel: '۸ سرعته', gearCount: 8, length: 4713, width: 1827, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۴,۰۰۰-۵,۵۰۰', advantages: 'اسپرت، دینامیک', disadvantages: 'نگهداری گران', leasingConditions: 'تا ۲۴ ماه از آرین'}},
        'X3': {'-': {enginePower: 192, torque: 280, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'B48', gearboxModel: '۸ سرعته', gearCount: 8, length: 4708, width: 1891, netWeight: 1845, brakeSystem: 'دیسکی، ESP', marketPrice: '۵,۵۰۰-۷,۰۰۰', advantages: 'آفرود، لوکس', disadvantages: 'قطعات کمیاب', leasingConditions: 'تا ۲۴ ماه'}},
        'IX1': { '25L': {} }
    },
    'بی وای دی': {
        'Atto 3': {'-': {enginePower: 204, torque: 310, emissionStandard: 'Euro 6', cylinderCount: 0, engineModel: 'برقی', gearboxModel: 'تک سرعته', gearCount: 1, length: 4450, width: 1875, netWeight: 1750, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۰۰۰-۲,۵۰۰', advantages: 'برقی، برد ۴۲۰km', disadvantages: 'شارژ ضعیف', leasingConditions: 'تا ۲۴ ماه از بهمن'}},
        'سانگ پلاس': { 'هیبرید': {} }
    },
    'بیسو': {
        'T5': {'-': {enginePower: 221, torque: 393, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲.۰T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4690, width: 1900, netWeight: 1750, brakeSystem: 'دیسکی، ESP', marketPrice: '۱,۸۰۰-۲,۲۰۰', advantages: 'SUV قدرتمند', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۲۴ ماه از فردا'}},
    },
    'پاژن': {},
    'پروتون': {
        'جن تو': {'-': {enginePower: 136, torque: 235, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: '۴G63', gearboxModel: 'CVT', length: 4499, width: 1767, netWeight: 1350, brakeSystem: 'دیسکی', marketPrice: '۴۰۰-۵۰۰', advantages: 'هاچبک اقتصادی', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
    },
    'پژو': {
        '۲۰۷i': {'-': {enginePower: 105, torque: 142, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'TU5', gearboxModel: 'دستی', gearCount: 5, length: 3900, width: 1675, netWeight: 1080, brakeSystem: 'دیسکی، ABS', marketPrice: '۵۰۰-۵۵۰', advantages: 'شهری، مدرن', disadvantages: 'فضای محدود', leasingConditions: 'تا ۳۶ ماه از IKCO'}},
        '۳۰۱': {'-': {enginePower: 115, torque: 150, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'EB2', gearboxModel: '۵ سرعته', gearCount: 5, length: 4390, width: 1746, netWeight: 1090, brakeSystem: 'دیسکی', marketPrice: '۶۰۰-۷۰۰', advantages: 'سدان جادار', disadvantages: 'شتاب متوسط', leasingConditions: 'تا ۳۶ ماه'}},
    },
    'پورشه': {
        'Cayenne': {'-': {enginePower: 340, torque: 500, emissionStandard: 'Euro 6', cylinderCount: 6, engineModel: '۳.۰V6', gearboxModel: '۸ سرعته', gearCount: 8, length: 4926, width: 1983, netWeight: 2200, brakeSystem: 'دیسکی، ESP', marketPrice: '۱۰,۰۰۰+', advantages: 'آفرود لوکس', disadvantages: 'قیمت نجومی', leasingConditions: '- (نقدی)'}},
        'ماکان': { '9 کلید': {} }
    },
    'تویوتا': {
        'کرولا': {
            '-': {enginePower: 169, torque: 205, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲ZR-FE', gearboxModel: 'CVT', length: 4630, width: 1775, netWeight: 1320, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۲۰۰-۲,۸۰۰', advantages: 'دوام، مصرف پایین', disadvantages: 'آپشن پایه', leasingConditions: 'تا ۳۶ ماه از بهمن'},
            'هیبرید موتور 1800': {},
            'تنفس طبیعی 1500 فول': {},
            'توربو 1200': {},
            'تنفس طبیعی 1500نیمه فول': {}
        },
        'RAV4': {'-': {enginePower: 171, torque: 221, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲AR-FE', gearboxModel: 'CVT', length: 4600, width: 1845, netWeight: 1500, brakeSystem: 'دیسکی، ESP', marketPrice: '۲,۵۰۰-۳,۲۰۰', advantages: 'SUV خانوادگی', disadvantages: 'قطعات گران', leasingConditions: 'تا ۳۶ ماه'}},
        'راو 4': { 'دو دیفرانسیل هیبرید': {}, 'دو دیفرانسیل': {}, 'تک دیفرانسیل ': {} },
        'وایلدلندر': { 'لاکچری پلاس': {} },
        'کمری': { 'هیبرید 2500': {} },
        'کرولا کراس': { 'هیبرید موتور 2000': {} },
        'BZ4': { 'فول': {} },
        'لوین': { 'هیبرید SE': {}, 'هیبرید': {}, 'بنزینی': {} },
        'BZ3': { 'فول': {} },
        'یاریس': { '1500فول': {} }
    },
    'تیگارد': { 'X35': { 'اتوماتیک': {} } },
    'جتا': { 'VS7': { 'توربو 1400': {} }, 'VS5 ': { 'توربو 1400': {} } },
    'جک': {
        'S5': {'-': {enginePower: 172, torque: 265, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴G63T', gearboxModel: 'دوکلاچه', gearCount: 6, length: 4420, width: 1830, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۰۰۰-۱,۳۰۰', advantages: 'اسپرت، شتاب', disadvantages: 'خدمات ضعیف', leasingConditions: 'تا ۲۴ ماه از کرمان'}, 'اتوماتیک - فیس جدید': {} },
        'S3': {'-': {enginePower: 136, torque: 170, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'BLD15', gearboxModel: 'CVT', length: 4415, width: 1765, netWeight: 1350, brakeSystem: 'دیسکی، ABS', marketPrice: '۹۰۰-۱,۱۰۰', advantages: 'کراس کوچک', disadvantages: 'شتاب ضعیف', leasingConditions: 'تا ۲۴ ماه'}, 'اتوماتیک': {} },
        'E50A': { 'برقی': {} }, 
        'J4': { 'اتوماتیک': {} }
    },
    'جیلی': {
        'امگرند ۷': {'-': {enginePower: 163, torque: 250, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴G25T', gearboxModel: 'CVT', length: 4630, width: 1800, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۰۰۰-۱,۲۰۰', advantages: 'سدان اقتصادی', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۲۴ ماه از خودروسازان'}},
        'آزکارا': { 'هیبرید': {} }
    },
    'چانگان': {
        'CS35 Plus': {'-': {enginePower: 156, torque: 260, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'JL473Q', gearboxModel: 'دوکلاچه', gearCount: 7, length: 4330, width: 1830, netWeight: 1450, brakeSystem: 'دیسکی، EBD', marketPrice: '۱,۲۰۰-۱,۴۰۰', advantages: '۶ ایربگ، دوربین', disadvantages: 'مونتاژ متوسط', leasingConditions: 'تا ۳۶ ماه از سایپا'}, 'تیپ 3': {}, 'تیپ 2': {}},
        'CS55': {'-': {enginePower: 188, torque: 300, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'JL479Q', gearboxModel: '۶ سرعته', gearCount: 6, length: 4650, width: 1850, netWeight: 1550, brakeSystem: 'دیسکی، EBD', marketPrice: '۱,۵۰۰-۱,۷۰۰', advantages: 'سانروف، کروز', disadvantages: 'تاخیر تحویل', leasingConditions: 'تا ۳۶ ماه'}},
        'CS55 پلاس': { '1500 توربو': {} }
    },
    'دامای': {
        '۸': {'-': {enginePower: 197, torque: 390, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TGDI', gearboxModel: 'دوکلاچه', gearCount: 7, length: 4921, width: 1910, netWeight: 1800, brakeSystem: 'دیسکی، ESP', marketPrice: '۲,۰۰۰-۲,۵۰۰', advantages: '۷ صندلی، هیبریدی', disadvantages: 'وزن سنگین', leasingConditions: 'تا ۲۴ ماه از آرین'}},
    },
    'دانگ فنگ': {
        'H30 Cross': {'-': {enginePower: 117, torque: 155, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴A91S', gearboxModel: 'CVT', length: 4318, width: 1740, netWeight: 1300, brakeSystem: 'دیسکی، ABS', marketPrice: '۵۰۰-۶۵۰', advantages: 'کراس اقتصادی', disadvantages: 'قدیمی', leasingConditions: 'تا ۲۴ ماه از بهمن'}},
        'T5': {'-': {enginePower: 190, torque: 290, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴G15T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4690, width: 1900, netWeight: 1750, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۸۰۰-۲,۲۰۰', advantages: 'SUV قدرتمند', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۲۴ ماه'}},
        'دیگنیتی': { 'پرستیژ': {}, 'پرایم': {} },
        'شاین مکس': { 'بنزینی': {}, 'هیبرید': {} }
    },
    'دایون': { 'y7': { 'پلاس': {} }, 'Y5': { 'پلاس': {} } },
    'دوو': {
        'ماتیز': {'-': {enginePower: 65, torque: 91, emissionStandard: 'Euro 3', cylinderCount: 3, engineModel: 'F8CV', gearboxModel: 'دستی', gearCount: 5, length: 3595, width: 1495, netWeight: 775, brakeSystem: 'دیسکی جلو', marketPrice: '۱۵۰-۲۵۰', advantages: 'ارزان، شهری', disadvantages: 'ایمنی پایین', leasingConditions: '- (نقدی)'}},
    },
    'دی اس': {
        'DS7 Crossback': {'-': {enginePower: 227, torque: 350, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'PureTech', gearboxModel: '۸ سرعته', gearCount: 8, length: 4590, width: 1895, netWeight: 1650, brakeSystem: 'دیسکی، ESP', marketPrice: '۳,۵۰۰-۴,۵۰۰', advantages: 'لوکس فرانسوی', disadvantages: 'قطعات کمیاب', leasingConditions: 'تا ۲۴ ماه از آرین'}},
    },
    'راین': {},
    'رنو': {
        'تندر ۹۰': {'-': {enginePower: 105, torque: 140, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'K4M', gearboxModel: 'دستی', gearCount: 5, length: 4290, width: 1746, netWeight: 1090, brakeSystem: 'دیسکی، ABS', marketPrice: '۵۵۰-۶۵۰', advantages: 'دوام، جادار', disadvantages: 'طراحی قدیمی', leasingConditions: 'تا ۳۶ ماه از پارس'}},
        'ساندرو استپ‌وی': {'-': {enginePower: 105, torque: 140, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'K4M', gearboxModel: 'دستی', gearCount: 5, length: 4178, width: 1753, netWeight: 1110, brakeSystem: 'دیسکی، ABS', marketPrice: '۶۰۰-۷۰۰', advantages: 'کراس اقتصادی', disadvantages: 'شتاب متوسط', leasingConditions: 'تا ۳۶ ماه'}},
        'کولیوس': { 'فول': {} }, 'تلیسمان': { 'E3': {} }, 'آرکانا': { 'موتور 1600': {} }
    },
    'زوتی': {
        'Z300': {'-': {enginePower: 128, torque: 167, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: '۴G15', gearboxModel: 'CVT', length: 4370, width: 1725, netWeight: 1300, brakeSystem: 'دیسکی', marketPrice: '۴۰۰-۵۰۰', advantages: 'سدان ارزان', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
    },
    'سانگ یانگ': {
        'رکستون': {'-': {enginePower: 181, torque: 365, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'e-XDi', gearboxModel: '۶ سرعته', gearCount: 6, length: 4810, width: 1920, netWeight: 2050, brakeSystem: 'دیسکی، ESP', marketPrice: '۲,۵۰۰-۳,۰۰۰', advantages: 'SUV آفرود', disadvantages: 'خدمات محدود', leasingConditions: 'تا ۲۴ ماه از رامک'}, 'G4': {}},
        'نیو کوراندو': { 'توربو 1500 دو دیفرانسیل': {}, 'توربو 1500': {} }
    },
    'سایپا': {
        'شاهین G': {'-': {enginePower: 110, torque: 162, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'M15TC', gearboxModel: 'دستی', gearCount: 5, length: 4446, width: 1780, netWeight: 1260, brakeSystem: 'دیسکی، EBD', marketPrice: '۶۰۰-۶۵۰', advantages: 'توربو، ESC', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۳۶ ماه از سایپا'}},
        'اطلس E': {'-': {enginePower: 90, torque: 137, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'M15GSI', gearboxModel: 'CVT', gearCount: 4, length: 4130, width: 1730, netWeight: 1080, brakeSystem: 'دیسکی، ABS', marketPrice: '۷۰۰-۷۵۰', advantages: 'فول آپشن', disadvantages: 'شتاب ضعیف', leasingConditions: 'تا ۳۶ ماه'}},
        'شاهین': {
            'پلاس اتوماتیک ': {},
            'اتومات': {},
            ' G دنده ای': {},
            'GL دنده ای': {}
        },
        'DL5': { 'توربو 1500': {} },
        'سهند': { 'اتوماتیک': {}, 'G': {}, 'S': {} },
        'کوییک': {
            'R اتوماتیک فول پلاس ': {},
            'اتوماتیک فول پلاس': {},
            'دنده ای  GXR-L': {},
            'دنده ای  GX-L': {},
            'RS دنده‌ای': {},
            'S': {},
            'دنده ای GXH-R': {},
            'دنده ای  GXH': {}
        },
        'اطلس': { 'G': {}, 'GL': {} },
        'ساینا': {
            'S اتوماتیک': {},
            'GX دوگانه سوز': {},
            'S  دوگانه سوز': {},
            'S - ESP': {}
        }
    },
    'سوبارو': {
        'فورستر': {'-': {enginePower: 156, torque: 204, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'FB20', gearboxModel: 'CVT', length: 4595, width: 1795, netWeight: 1520, brakeSystem: 'دیسکی، AWD', marketPrice: '۳,۰۰۰-۴,۰۰۰', advantages: 'AWD دائمی', disadvantages: 'قطعات گران', leasingConditions: '- (نقدی)'}},
    },
    'سوزوکی': {
        'ویتارا': {'-': {enginePower: 128, torque: 196, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'M16A', gearboxModel: '۶ سرعته', gearCount: 6, length: 4175, width: 1775, netWeight: 1350, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۰۰۰-۲,۵۰۰', advantages: 'آفرود کوچک', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}, 'هیبرید دو دیفرانسیل': {}, 'هیبرید تک دیفرانسیل': {}},
        'جیمنی': { 'پنج درب': {} },
        'فرانکس': { 'GLX هیبرید': {} },
        'بالنو': { 'موتور 1500': {} },
        'سیاز': { 'موتور 1500': {} }
    },
    'سیتروئن': {
        'C3': {'-': {enginePower: 82, torque: 118, emissionStandard: 'Euro 5', cylinderCount: 3, engineModel: 'EB0', gearboxModel: '۵ سرعته', gearCount: 5, length: 3996, width: 1749, netWeight: 1050, brakeSystem: 'دیسکی', marketPrice: '۶۰۰-۷۰۰', advantages: 'هاچبک شهری', disadvantages: 'شتاب ضعیف', leasingConditions: 'تا ۳۶ ماه از سایپا'}, 'فول فاقد گرمکن صندلی': {}},
    },
    'سئات': { 'آتکا': { 'توربو 2000': {} } },
    'فردا موتورز': {
        '۳۱۱': {'-': {enginePower: 103, torque: 140, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: '۴G15S', gearboxModel: 'CVT', length: 4318, width: 1690, netWeight: 1250, brakeSystem: 'دیسکی', marketPrice: '۴۰۰-۵۰۰', advantages: 'سدان ارزان', disadvantages: 'کیفیت پایین', leasingConditions: 'تا ۲۴ ماه'}},
        'سوبا M4': { 'هفت نفره': {} },
        'T5': { 'اتوماتیک': {} },
        'SX5': { 'اتوماتیک': {} },
        '511': { 'اتوماتیک': {} }
    },
    'فولکس': {
        'پاسات B8': {'-': {enginePower: 150, torque: 250, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TSI', gearboxModel: '۶ سرعته', gearCount: 6, length: 4878, width: 1832, netWeight: 1550, brakeSystem: 'دیسکی، ESP', marketPrice: '۳,۵۰۰-۴,۵۰۰', advantages: 'سدان لوکس', disadvantages: 'قطعات کمیاب', leasingConditions: 'تا ۲۴ ماه از ماموت'}},
        'تیگوان': {'-': {enginePower: 186, torque: 300, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TSI', gearboxModel: '۷ سرعته', gearCount: 7, length: 4486, width: 1839, netWeight: 1700, brakeSystem: 'دیسکی، ESP', marketPrice: '۴,۰۰۰-۵,۰۰۰', advantages: 'SUV خانوادگی', disadvantages: 'مصرف متوسط', leasingConditions: 'تا ۲۴ ماه'}, 'فول': {}},
        'پاسات': { 'فول': {} },
        'تی راک': { 'توربو 1500': {} },
        'ID4': { 'برقی': {} }
    },
    'فونیکس': {
        'تیگو 8  پرو': { 'هیبرید نیوفیس': {}, 'مکس IE': {}, 'هیبرید': {} },
        'آریزو 8': { 'توربو 2000': {} },
        'تیگو 7 پرو': {
            'مکس دو دیفرانسیل': {},
            'هیبرید e+': {},
            'مکس': {},
            'پریمیوم': {}
        },
        'FX': { 'AWD': {}, 'پریمیوم': {} },
        'آریزو 6 جی تی ': { 'توربو 1600': {} },
        'آریزو 6 پرو': { 'اتوماتیک': {} }
    },
    'فیات': {
        '۵۰۰': {'-': {enginePower: 69, torque: 102, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'FIRE', gearboxModel: 'دستی', gearCount: 5, length: 3553, width: 1627, netWeight: 930, brakeSystem: 'دیسکی', marketPrice: '۱,۵۰۰-۲,۰۰۰', advantages: 'هاچبک کوچک', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
        '500': { 'اتوماتیک 1200': {} }
    },
    'کرمان موتور': {
        'جک S5': {'-': {enginePower: 172, torque: 265, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴G63T', gearboxModel: 'دوکلاچه', gearCount: 6, length: 4420, width: 1830, netWeight: 1450, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۰۰۰-۱,۳۰۰', advantages: 'شتاب خوب', disadvantages: 'خدمات ضعیف', leasingConditions: 'تا ۲۴ ماه'}},
        'J7': { 'اتوماتیک': {} }, 'K7': { 'اتوماتیک': {} }, 'J7 EV': { 'برقی': {} }
    },
    'کی ام سی ': {
        'X5': { 'توربو 1500': {} },
        'A5': { 'توربو 1500': {} },
        'J7 EV': { 'برقی پلاس': {} },
        'SR3': { 'موتور 1600': {} },
        'ایگل': { 'موتور 1500': {} }
    },
    'کوپا': {},
    'کیا': {
        'سراتو': {'-': {enginePower: 150, torque: 192, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'G4FC', gearboxModel: '۶ سرعته', gearCount: 6, length: 4560, width: 1780, netWeight: 1320, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۵۰۰-۲,۰۰۰', advantages: 'سدان اسپرت', disadvantages: 'قدیمی', leasingConditions: 'تا ۳۶ ماه از سایپا'}, 'GT لاین': {}},
        'اسپورتیج': {'-': {enginePower: 177, torque: 265, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'G4KJ', gearboxModel: '۶ سرعته', gearCount: 6, length: 4480, width: 1850, netWeight: 1600, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۲۰۰-۲,۷۰۰', advantages: 'کراس مدرن', disadvantages: 'قطعات کمیاب', leasingConditions: 'تا ۳۶ ماه'}, '1500 توربو': {}, 'توربو 1500 - نیمه فول': {}},
        'K5': { 'توربو 1500': {}, 'موتور 2000': {} },
        'سلتوس': { 'اتوماتیک': {} },
        'سونت': { 'موتور 1500': {} }
    },
    'گروه بهمن': {
        'مزدا ۳': {'-': {enginePower: 148, torque: 202, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'Skyactiv', gearboxModel: '۶ سرعته', gearCount: 6, length: 4460, width: 1795, netWeight: 1350, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۵۰۰-۱,۸۰۰', advantages: 'سواری نرم', disadvantages: 'قطعات گران', leasingConditions: 'تا ۳۶ ماه'}},
        'فیدلیتی': {
            'پرستیژ (7نفره)': {},
            'پرستیژ (5نفره)': {},
            'الیت 7 نفره': {},
            'الیت 5 نفره': {},
            'پرایم(7 نفره)': {},
            'پرایم(5 نفره)': {}
        },
        'رسپکت': { '2 جدید': {} }
    },
    'گریت وال': {
        'Haval H6': {'-': {enginePower: 197, torque: 315, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'GW4C20', gearboxModel: 'دوکلاچه', gearCount: 7, length: 4650, width: 1840, netWeight: 1650, brakeSystem: 'دیسکی، ESP', marketPrice: '۱,۸۰۰-۲,۲۰۰', advantages: 'SUV جادار', disadvantages: 'مونتاژ متوسط', leasingConditions: 'تا ۲۴ ماه از آرین'}},
        'تانک 300': { 'توربو 2000': {} }, 'هاوال H8': { 'فول اتوماتیک': {} }
    },
    'گک': {
        'GS8': {'-': {enginePower: 220, torque: 350, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲.۰T', gearboxModel: '۶ سرعته', gearCount: 6, length: 4980, width: 1950, netWeight: 1900, brakeSystem: 'دیسکی، ESP', marketPrice: '۲,۵۰۰-۳,۰۰۰', advantages: '۷ صندلی، لوکس', disadvantages: 'خدمات نوپا', leasingConditions: 'تا ۲۴ ماه از آرین'}},
        'امکو': { 'توربو 1500': {} },
        'امپو': { 'توربو 1500': {}, 'هیبرید': {} },
        'امزوم GS3': { 'توربو 1500': {} }
    },
    'لاماری': { 'ایما': { 'هیبرید': {}, 'اتوماتیک': {} } },
    'لکسوس': {
        'NX300h': {'-': {enginePower: 197, torque: 210, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: '۲AR-FXE', gearboxModel: 'CVT', length: 4630, width: 1845, netWeight: 1750, brakeSystem: 'دیسکی، ESP', marketPrice: '۵,۰۰۰-۶,۵۰۰', advantages: 'هیبریدی، لوکس', disadvantages: 'قیمت بالا', leasingConditions: '- (نقدی)'}},
    },
    'لوتوس': {}, 'لوکسژن': {},
    'لوکانو': { 'L8': { 'توربو 2000': {} }, 'L7': { 'توربو 1600': {} } },
    'لیفان': {
        '۶۲۰': {'-': {enginePower: 131, torque: 160, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: 'LFB479Q', gearboxModel: 'CVT', length: 4400, width: 1700, netWeight: 1300, brakeSystem: 'دیسکی', marketPrice: '۳۰۰-۴۰۰', advantages: 'سدان ارزان', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
    },
    'مازراتی': {
        'Ghibli': {'-': {enginePower: 350, torque: 500, emissionStandard: 'Euro 6', cylinderCount: 6, engineModel: 'V6', gearboxModel: '۸ سرعته', gearCount: 8, length: 4971, width: 1945, netWeight: 1820, brakeSystem: 'دیسکی، ESP', marketPrice: '۱۰,۰۰۰+', advantages: 'اسپرت لوکس', disadvantages: 'نگهداری گران', leasingConditions: '- (نقدی)'}},
    },
    'مدیران خودرو': {
        'چری تیگو ۸': {'-': {enginePower: 197, torque: 390, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TGDI', gearboxModel: 'دوکلاچه', gearCount: 7, length: 4921, width: 1910, netWeight: 1800, brakeSystem: 'دیسکی، ESP', marketPrice: '۲,۰۰۰-۲,۵۰۰', advantages: '۷ صندلی', disadvantages: 'وزن سنگین', leasingConditions: 'تا ۳۶ ماه'}},
        'چری تیگو ۷': {'-': {enginePower: 147, torque: 210, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'SQR484F', gearboxModel: 'CVT', length: 4470, width: 1837, netWeight: 1500, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۲۰۰-۱,۵۰۰', advantages: 'اقتصادی', disadvantages: 'مواد متوسط', leasingConditions: 'تا ۳۶ ماه از مدیران'}},
        'ام وی ام x55 پرو': { 'IE': {}, 'اکسلنت': {}, 'IE اسپرت': {}, 'اکسلنت اسپرت': {} },
        'چری آریزو 5 FL': { 'اسپرت اکسلنت': {} },
        'X33 کراس': { 'اتوماتیک': {}, 'دنده ای ': {} },
        'ام وی ام x22': { 'pro دنده': {} }
    },
    'مزدا': {
        'CX-5': {'-': {enginePower: 190, torque: 259, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'Skyactiv', gearboxModel: '۶ سرعته', gearCount: 6, length: 4550, width: 1840, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۲۰۰-۲,۷۰۰', advantages: 'آفرود، لوکس', disadvantages: 'مصرف متوسط', leasingConditions: 'تا ۳۶ ماه از بهمن'}},
        'CX30': { 'موتور 2000': {} }, 'مزدا 3 وارداتی': { 'پریمیوم': {} }
    },
    'مکث موتور ': { 'تیارا': { 'پرایم': {} } },
    'میتسوبیشی': {
        'اوتلندر': {'-': {enginePower: 165, torque: 222, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '۴B11', gearboxModel: 'CVT', length: 4640, width: 1800, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۹۰۰-۲,۵۰۰', advantages: 'سواری نرم', disadvantages: 'بازار ضعیف', leasingConditions: 'تا ۲۴ ماه از آرین'}, 'H-LINE دو دیفرانسیل': {}, 'H-LINE تک دیفرانسیل': {}, 'M-LINE دو دیفرانسیل': {}, 'M-LINE تک دیفرانسیل': {}},
    },
    'مینی': {
        'Cooper S': {'-': {enginePower: 176, torque: 280, emissionStandard: 'Euro 6', cylinderCount: 3, engineModel: 'B48', gearboxModel: '۷ سرعته', gearCount: 7, length: 3850, width: 1727, netWeight: 1350, brakeSystem: 'دیسکی، ESP', marketPrice: '۳,۰۰۰-۴,۰۰۰', advantages: 'هاچبک اسپرت', disadvantages: 'فضای کوچک', leasingConditions: '- (نقدی)'}},
    },
    'نیسان': {
        'جوک': {'-': {enginePower: 114, torque: 156, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'HR16DE', gearboxModel: 'CVT', length: 4135, width: 1760, netWeight: 1300, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۵۰۰-۲,۰۰۰', advantages: 'کراس شهری', disadvantages: 'شتاب متوسط', leasingConditions: 'تا ۲۴ ماه از جهان'}},
        'آلتیما': { 'موتور 2000': {} },
        'ترا': { 'توربو 2000 - اکسکلوسیو': {}, 'توربو 2000 - ساده': {} },
        'قشقایی': { 'آنر': {}, 'موتور 2000': {} },
        'سیلفی': { 'مکس ادیشن': {}, 'هیبرید پلاس': {} },
        'کیکس': { 'موتور 1500': {} },
        'سانی': { 'موتور 1500': {} }
    },
    'ولوو': {
        'XC60': {'-': {enginePower: 190, torque: 300, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'D4', gearboxModel: '۸ سرعته', gearCount: 8, length: 4688, width: 1902, netWeight: 1900, brakeSystem: 'دیسکی، ESP', marketPrice: '۴,۵۰۰-۶,۰۰۰', advantages: 'ایمنی بالا', disadvantages: 'قطعات گران', leasingConditions: 'تا ۲۴ ماه از ماموت'}},
    },
    'ونوسیا': { 'وی-آنلاین': { 'DD-i': {} }, 'D60 پلاس': { 'بنزینی': {} } },
    'وویا': { 'فری': { 'توربو 1500 هیبرید': {} } },
    'هاوال': { 'H6': { 'هیبرید': {} } },
    'هایما': {
        'S7': {'-': {enginePower: 170, torque: 230, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'TGDI', gearboxModel: '۶ سرعته', gearCount: 6, length: 4700, width: 1850, netWeight: 1600, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۲۰۰-۱,۵۰۰', advantages: 'جادار، آفرود', disadvantages: 'تاخیر', leasingConditions: 'تا ۳۶ ماه از IKCO'}},
        'S8': { 'اتوماتیک': {} },
        'S7 توربو': { 'پرو': {}, 'پلاس': {} },
        '7x': { 'توربو 1600': {} },
        'S5': { 'پرو توربو 1500': {}, '6 دنده اتوماتیک': {} }
    },
    'هن تنگ': {
        'X7': {'-': {enginePower: 197, torque: 315, emissionStandard: 'Euro 6', cylinderCount: 4, engineModel: 'TGDI', gearboxModel: 'دوکلاچه', gearCount: 7, length: 4730, width: 1900, netWeight: 1650, brakeSystem: 'دیسکی، ESP', marketPrice: '۱,۸۰۰-۲,۲۰۰', advantages: 'SUV مدرن', disadvantages: 'خدمات نوپا', leasingConditions: 'تا ۲۴ ماه از آرین'}},
    },
    'هوندا': {
        'CR-V': {'-': {enginePower: 155, torque: 190, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'K24Z', gearboxModel: 'CVT', length: 4570, width: 1820, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۲,۵۰۰-۳,۵۰۰', advantages: 'دوام، جادار', disadvantages: 'قدیمی', leasingConditions: '- (نقدی)'}},
        'ZR-V': { 'هیبرید': {} },
        'HR-V': { 'هیبرید': {} },
        'وزل': { 'موتور 1500 بنزینی': {} },
        'ENS1': { 'برقی': {} },
        'سیتی': { 'موتور 1500': {} }
    },
    'هونگچی': { 'H5': { 'توربو 2000': {} }, 'E-MQ5': { 'برقی': {} } },
    'هیوندای': {
        'توسان': {'-': {enginePower: 178, torque: 265, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'G4GC', gearboxModel: '۶ سرعته', gearCount: 6, length: 4410, width: 1820, netWeight: 1550, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۸۰۰-۲,۲۰۰', advantages: 'آپشن کامل', disadvantages: 'استهلاک', leasingConditions: 'تا ۲۴ ماه از کرمان'}, 'تک دیفرانسیل 2000': {}},
        'آزرا': { 'فول شرکتی (کرمان موتور)': {} },
        'سانتافه': { 'دو دیفرانسیل فول - (GDI) DM 2400': {} },
        'کونا': { 'موتور 2000': {} },
        'کرتا': { 'اتوماتیک 1500': {} },
        'النترا': { 'اتوماتیک-1600': {} },
        'اکسنت': { 'اتوماتیک 1600': {} }
    },
    'یوآز': {}, 'دیار خودرو': {},
},
  [VehicleCategory.Pickup]: {
    'فوتون': { 'Tunland G7': {'-': { enginePower: 163, torque: 390, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: 'WP4.1', gearboxModel: '۶ سرعته', gearCount: 6, length: 5320, width: 1900, netWeight: 1950, brakeSystem: 'دیسکی، ABS', marketPrice: '۱,۲۰۰-۱,۵۰۰', advantages: 'بار ۱۰۰۰kg، دو کابین', disadvantages: 'کیفیت متوسط', leasingConditions: 'تا ۴۸ ماه از IKCO دیزل' }, 'بنزینی': {}}, 'تونلند G7': {'بنزینی': {}}},
    'زامیاد': { 'Z24': {'-': { enginePower: 95, torque: 190, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: 'M24', gearboxModel: 'دستی', gearCount: 5, length: 5230, width: 1740, netWeight: 1500, brakeSystem: 'دیسکی جلو', marketPrice: '۴۰۰-۵۰۰', advantages: 'دوام، آفرود', disadvantages: 'ایمنی پایین', leasingConditions: 'تا ۴۸ ماه' }}},
    'وانت آریسان': { '۲': {'-': { enginePower: 87, torque: 130, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: 'M15', gearboxModel: 'دستی', gearCount: 5, length: 5030, width: 1720, netWeight: 1200, brakeSystem: 'دیسکی جلو', marketPrice: '۳۵۰-۴۰۰', advantages: 'اقتصادی', disadvantages: 'راحتی کم', leasingConditions: 'تا ۴۸ ماه از IKCO' }}},
    'فودی': { 'LiChang T5': {'-': { enginePower: 136, torque: 320, emissionStandard: 'Euro 5', cylinderCount: 4, engineModel: '4G69', gearboxModel: 'دستی', gearCount: 5, length: 5040, width: 1730, netWeight: 1650, brakeSystem: 'دیسکی، ABS', marketPrice: '۸۰۰-۱,۰۰۰', advantages: 'ارزان، ۸۰۰kg', disadvantages: 'شتاب ضعیف', leasingConditions: 'تا ۲۴ ماه از جهان' }}},
    'کاپرا': { '2.4': {'-': { enginePower: 136, torque: 310, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: '4KH1', gearboxModel: 'دستی', gearCount: 5, length: 5040, width: 1730, netWeight: 1650, brakeSystem: 'دیسکی، ABS', marketPrice: '۹۰۰-۱,۲۰۰', advantages: 'آفرود', disadvantages: 'خدمات محدود', leasingConditions: 'تا ۳۶ ماه از بهمن' }}},
    'پارس خودرو': { 'وانت ۱۵۱': {'-': { enginePower: 71, torque: 108, emissionStandard: 'Euro 4', cylinderCount: 4, engineModel: 'M13', gearboxModel: 'دستی', gearCount: 5, length: 4245, width: 1600, netWeight: 840, brakeSystem: 'دیسکی جلو', marketPrice: '۳۰۰-۴۰۰', advantages: 'بار سبک', disadvantages: 'ایمنی پایین', leasingConditions: 'تا ۳۶ ماه از سایپا' }}},
    'ایران خودرو': { 'وانت آریسان 2': { 'دوگانه سوز': {} } },
    'آمیکو': { 'دو کابین آسنا': { 'دنده ای': {} } },
    'جک': { 'T8': { 'دنده ای': {} } },
    'سایپا': {
        'وانت کارون': { 'دنده ای': {} },
        'وانت زامیاد': {
            'دوگانه سوز آپشنال': {},
            'بنزینی آپشنال - دریچه سیمی': {},
            'بنزینی آپشنال': {}
        },
        'وانت پادرا پلاس': { 'دنده ای ': {} },
        'پراید 151': { 'SE': {} }
    },
    'کی ام سی ': { 'T9': { 'توربو 2000': {} } },
    'گروه بهمن': {
        'پیکاپ G9': { 'توربو 2000': {} },
        'کاپرا U': { 'دو دیفرانسیل': {} },
        'کاپرا دو کابین': { 'دو دیفرانسیل دنده ای': {} }
    },
    'هیوسو': { 'وانت T205': { 'موتور 1400': {} } },
    'مکث موتور ': { 'کلوت': { 'اتوماتیک': {} } }
  },
  [VehicleCategory.Construction]: {
      'کوماتسو': {
          'بیل مکانیکی': { 'PC200': { fuelType: 'گازوییلی', cylinderCount: 6 }, 'PC800': { fuelType: 'گازوییلی', cylinderCount: 6 } },
          'لودر': { 'WA470': { fuelType: 'گازوییلی', cylinderCount: 6 } }
      },
      'کاترپیلار': { 'بولدوزر': { 'D8': { fuelType: 'گازوییلی', cylinderCount: 8 } } }
  },
  [VehicleCategory.Forklift]: { 'کوماتسو': { 'برقی': { 'FB25': { capacity: '2.5 تن' } } } }
};


type SortField = 'plateNumber' | 'vehicleCode' | 'vehicleType' | 'brand' | 'model' | 'vehicleTip' | 'year' | 'status' | null;
type SortDirection = 'asc' | 'desc';

const VehicleManagement: React.FC<VehicleManagementProps> = ({ vehicles, branches, onAddVehicle, onUpdateVehicle, onRefresh, refreshing = false }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [showFormDialog, setShowFormDialog] = useState(false);
    const [showSpecsDialog, setShowSpecsDialog] = useState(false);
    const [selectedSpec, setSelectedSpec] = useState<any>(null);
    const [sortField, setSortField] = useState<SortField>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [newStatus, setNewStatus] = useState('حذف شده');
    const [deletingVehicle, setDeletingVehicle] = useState(false);
    const [dependencies, setDependencies] = useState<any>(null);
    const [deleteType, setDeleteType] = useState<'soft' | 'hard'>('soft');
    
    const handleEdit = (v: Vehicle) => {
        setEditingVehicle(v);
        setShowFormDialog(true);
    };
    
    const handleAddNew = () => {
        setEditingVehicle(null);
        setShowFormDialog(true);
    };
    
    const handleSaveVehicle = async (vehicle: Omit<Vehicle, 'id'>) => {
        if (editingVehicle) {
            if (onUpdateVehicle) {
                await onUpdateVehicle(editingVehicle.id, vehicle);
            }
        } else {
            await onAddVehicle(vehicle);
        }
        setShowFormDialog(false);
        setEditingVehicle(null);
        // Refresh data after save
        if (onRefresh) {
            onRefresh();
        }
    };

    const handleDeleteClick = async (vehicle: Vehicle) => {
        setVehicleToDelete(vehicle);
        
        // بررسی وابستگی‌ها
        try {
            const response = await fetch(`${getApiUrl()}/api/v1/vehicles/${vehicle.id}/dependencies`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (response.ok) {
                const deps = await response.json();
                setDependencies(deps);
            }
        } catch (error) {
            console.error('Error checking dependencies:', error);
        }
        
        setShowDeleteDialog(true);
    };

    const handleConfirmDelete = async () => {
        if (!vehicleToDelete || !deleteReason.trim()) {
            alert('لطفاً دلیل حذف را وارد کنید');
            return;
        }

        // تایید نهایی برای حذف فیزیکی
        if (deleteType === 'hard') {
            const confirmed = window.confirm(
                '⚠️ هشدار: این عملیات غیرقابل بازگشت است!\n\n' +
                'آیا مطمئن هستید که می‌خواهید این خودرو را به طور کامل و دائمی از سیستم حذف کنید؟\n\n' +
                'این خودرو دیگر قابل بازیابی نخواهد بود.'
            );
            if (!confirmed) {
                return;
            }
        }

        setDeletingVehicle(true);
        try {
            const response = await fetch(`${getApiUrl()}/api/v1/vehicles/${vehicleToDelete.id}/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    reason: deleteReason.trim(),
                    newStatus: newStatus || 'حذف شده',
                    hardDelete: deleteType === 'hard'
                })
            });

            if (response.ok) {
                const result = await response.json();
                alert(result.message || 'خودرو با موفقیت حذف شد');
                setShowDeleteDialog(false);
                setVehicleToDelete(null);
                setDeleteReason('');
                setDependencies(null);
                setDeleteType('soft');
                
                // Refresh data after delete
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                const error = await response.json();
                alert(error.message || 'خطا در حذف خودرو');
            }
        } catch (error: any) {
            console.error('Error deleting vehicle:', error);
            alert('خطا در حذف خودرو: ' + (error.message || 'خطای نامشخص'));
        } finally {
            setDeletingVehicle(false);
        }
    };
    
    // Removed old form state and handlers - now using VehicleFormDialog
    
    const getBranchName = (branchId: string) => branches.find(b => b.id === branchId)?.name || 'نامشخص';

    const exportCsv = (list: Vehicle[]) => {
        const rows = list.map(v => ({
            id: v.id,
            identifier: v.plateNumber ? formatPlateNumber(v.plateNumber) : (v.serialNumber || ''),
            brand: v.brand || '',
            model: v.model || '',
            ownerName: v.ownerName || '',
            branch: getBranchName(v.branchId),
            status: v.status || '',
        }));
        const header = Object.keys(rows[0] || { id:'', identifier:'', brand:'', model:'', ownerName:'', branch:'', status:'' });
        const csv = [header.join(','), ...rows.map(r => header.map(h => String((r as any)[h]).replaceAll('"','""')).map(v => `"${v}"`).join(','))].join('\n');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vehicles.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const filteredAndSortedVehicles = useMemo(() => {
        let result = vehicles;
        
        // Filter
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            result = result.filter(v => {
                const vehicleFullName = [v.brand, v.model].filter(Boolean).join(' ').toLowerCase();
                return (
                    (v.plateNumber && formatPlateNumber(v.plateNumber).toLowerCase().includes(lowercasedTerm)) ||
                    (v.serialNumber && v.serialNumber.toLowerCase().includes(lowercasedTerm)) ||
                    (vehicleFullName.includes(lowercasedTerm)) ||
                    (v.ownerName && v.ownerName.toLowerCase().includes(lowercasedTerm))
                );
            });
        }
        
        // Sort
        if (sortField) {
            result = [...result].sort((a, b) => {
                let aVal: any;
                let bVal: any;
                
                switch (sortField) {
                    case 'plateNumber':
                        aVal = a.plateNumber ? formatPlateNumber(a.plateNumber) : (a.serialNumber || '');
                        bVal = b.plateNumber ? formatPlateNumber(b.plateNumber) : (b.serialNumber || '');
                        break;
                    case 'vehicleCode':
                        // Extract numeric part from vehicleCode for proper numeric sorting
                        const extractNumber = (code: string): number => {
                            if (!code) return 0;
                            // Extract all digits from the code
                            const match = code.match(/\d+/);
                            return match ? parseInt(match[0], 10) : 0;
                        };
                        aVal = extractNumber((a as any).vehicleCode || '');
                        bVal = extractNumber((b as any).vehicleCode || '');
                        // For numeric sorting, we'll handle it in the comparison below
                        break;
                    case 'vehicleType':
                        aVal = (a as any).vehicleType || '';
                        bVal = (b as any).vehicleType || '';
                        break;
                    case 'brand':
                        aVal = a.brand || '';
                        bVal = b.brand || '';
                        break;
                    case 'model':
                        aVal = a.model || '';
                        bVal = b.model || '';
                        break;
                    case 'vehicleTip':
                        aVal = (a as any).vehicleTip || '';
                        bVal = (b as any).vehicleTip || '';
                        break;
                    case 'year':
                        aVal = a.year || 0;
                        bVal = b.year || 0;
                        break;
                    case 'status':
                        aVal = a.status || '';
                        bVal = b.status || '';
                        break;
                    default:
                        return 0;
                }
                
                // Handle numeric sorting (for vehicleCode, year, etc.)
                if (sortField === 'vehicleCode' || sortField === 'year') {
                    // Both should be numbers for these fields
                    if (typeof aVal === 'number' && typeof bVal === 'number') {
                        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                    }
                }
                
                // For other numeric fields
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }
                
                // String comparison for text fields
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                
                if (sortDirection === 'asc') {
                    return aStr.localeCompare(bStr, 'fa');
                } else {
                    return bStr.localeCompare(aStr, 'fa');
                }
            });
        }
        
        return result;
    }, [searchTerm, vehicles, sortField, sortDirection]);
    
    const handleToggleExpand = (vehicleId: string) => {
        setExpandedVehicleId(prevId => (prevId === vehicleId ? null : vehicleId));
    };
    
    const statusStyles: { [key in VehicleStatus]: string } = {
        [VehicleStatus.Active]: 'bg-green-100 text-green-800',
        [VehicleStatus.Sold]: 'bg-yellow-100 text-yellow-800',
        [VehicleStatus.Scrapped]: 'bg-red-100 text-red-800',
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                        <TruckIcon className="w-6 h-6 mr-2 text-sky-600" />
                        مدیریت خودروها
                    </h2>
                    <div className="flex items-center gap-2">
                        {onRefresh && (
                            <button
                                type="button"
                                onClick={onRefresh}
                                disabled={refreshing}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                                title="بروزرسانی لیست خودروها"
                            >
                                <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                                <span>{refreshing ? 'در حال بروزرسانی...' : 'بروزرسانی'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowSpecsDialog(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
                        >
                            <span>⚙️</span>
                            <span>مدیریت مشخصات خودرو</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleAddNew}
                            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 flex items-center gap-2 text-sm"
                        >
                            <span>➕</span>
                            <span>افزودن خودرو جدید</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">لیست خودروها</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => exportCsv(vehicles)} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm">خروجی اکسل</button>
                        <input
                        type="text"
                        placeholder="جستجو خودرو..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('plateNumber')}
                                >
                                    پلاک/شماره شاسی {sortField === 'plateNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('vehicleCode')}
                                >
                                    کد خودرو {sortField === 'vehicleCode' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('vehicleType')}
                                >
                                    نوع خودرو {sortField === 'vehicleType' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('brand')}
                                >
                                    برند {sortField === 'brand' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('model')}
                                >
                                    مدل اصلی {sortField === 'model' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('vehicleTip')}
                                >
                                    تیپ خودرو {sortField === 'vehicleTip' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('year')}
                                >
                                    سال ساخت {sortField === 'year' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('status')}
                                >
                                    وضعیت {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="px-4 py-3">عملیات</th>
                                <th className="px-4 py-3">دلیل حذف</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedVehicles.map(vehicle => {
                                const isDeleted = (vehicle as any).deletedAt !== null && (vehicle as any).deletedAt !== undefined;
                                return (
                                <React.Fragment key={vehicle.id}>
                                    <tr className={`border-b hover:bg-gray-50 ${isDeleted ? 'bg-gray-200 opacity-70' : 'bg-white'}`}>
                                        <td className="px-4 py-4 font-medium text-gray-900 font-mono">
                                            {vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : (vehicle.serialNumber || '-')}
                                        </td>
                                        <td className="px-4 py-4 font-mono text-sm">{vehicle.vehicleCode || '-'}</td>
                                        <td className="px-4 py-4">
                                            {(vehicle as any).vehicleType ? (
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                                    {(vehicle as any).vehicleType}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-4">{vehicle.brand || '-'}</td>
                                        <td className="px-4 py-4">{vehicle.model || '-'}</td>
                                        <td className="px-4 py-4">{(vehicle as any).vehicleTip || '-'}</td>
                                        <td className="px-4 py-4">{vehicle.year || '-'}</td>
                                        <td className="px-4 py-4">
                                            {vehicle.status && (
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusStyles[vehicle.status]}`}>
                                                    {vehicle.status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => handleToggleExpand(vehicle.id)} className="text-slate-500 hover:text-sky-600" title="جزئیات">
                                                    <ChevronDownIcon className={`w-5 h-5 transition-transform ${expandedVehicleId === vehicle.id ? 'rotate-180' : ''}`} />
                                                </button>
                                                {!isDeleted && (
                                                    <>
                                                        <button onClick={() => handleEdit(vehicle)} className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">ویرایش</button>
                                                        <button onClick={() => handleDeleteClick(vehicle)} className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">حذف</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            {(vehicle as any).deletionReason || '-'}
                                        </td>
                                    </tr>
                                    {expandedVehicleId === vehicle.id && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={10} className="p-4">
                                                <div className="bg-white p-4 rounded-lg border">
                                                    <h4 className="text-md font-bold text-slate-800 mb-3">تاریخچه مالکیت</h4>
                                                    {vehicle.ownerHistory && vehicle.ownerHistory.length > 0 ? (
                                                        <table className="w-full text-xs text-right">
                                                            <thead className="bg-slate-100">
                                                                <tr>
                                                                    <th className="p-2">نام مالک</th>
                                                                    <th className="p-2">از تاریخ</th>
                                                                    <th className="p-2">تا تاریخ</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {vehicle.ownerHistory.map(hist => (
                                                                    <tr key={hist.id} className="border-b">
                                                                        <td className="p-2 font-semibold">{hist.ownerName}</td>
                                                                        <td className="p-2">{formatJalali(hist.startDate)}</td>
                                                                        <td className="p-2">{formatJalali(hist.endDate)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <p className="text-sm text-slate-500 text-center py-4">تاریخچه مالکیت قبلی برای این خودرو ثبت نشده است.</p>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`.input-style { direction: ltr; text-align: right; display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; }`}</style>
            
            {/* دیالوگ فرم خودرو */}
            <VehicleFormDialog
                isOpen={showFormDialog}
                onClose={() => {
                    setShowFormDialog(false);
                    setEditingVehicle(null);
                    setSelectedSpec(null);
                }}
                onSave={handleSaveVehicle}
                initialData={editingVehicle}
                branches={branches}
                showSpecsButton={true}
                externalSpec={selectedSpec}
            />
            
            {/* دیالوگ مدیریت مشخصات خودرو - برای انتخاب و پر کردن فرم */}
            <VehicleSpecsDialog 
                isOpen={showSpecsDialog} 
                onClose={() => setShowSpecsDialog(false)}
                onSelectSpec={(spec) => {
                    // وقتی یک spec انتخاب می‌شود، فرم را باز کن و آن را پر کن
                    setSelectedSpec(spec);
                    setShowSpecsDialog(false);
                    setEditingVehicle(null);
                    setShowFormDialog(true);
                }}
            />

            {/* دیالوگ تایید حذف */}
            {showDeleteDialog && vehicleToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-red-600 mb-4">تایید حذف خودرو</h2>
                        
                        <div className="mb-4 p-4 bg-gray-50 rounded">
                            <p className="font-semibold">اطلاعات خودرو:</p>
                            <p>پلاک: {vehicleToDelete.plateNumber ? formatPlateNumber(vehicleToDelete.plateNumber) : (vehicleToDelete.serialNumber || '-')}</p>
                            <p>کد خودرو: {vehicleToDelete.vehicleCode || '-'}</p>
                            <p>برند: {vehicleToDelete.brand || '-'}</p>
                            <p>مدل: {vehicleToDelete.model || '-'}</p>
                        </div>

                        {dependencies && dependencies.hasDependencies && (
                            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                                <p className="font-semibold text-yellow-800 mb-2">⚠️ این خودرو در موارد زیر استفاده شده است:</p>
                                <ul className="list-disc list-inside text-sm text-yellow-700">
                                    {dependencies.tables.map((dep: any, idx: number) => (
                                        <li key={idx}>{dep.description}: {dep.count} مورد</li>
                                    ))}
                                </ul>
                                <p className="text-sm text-yellow-700 mt-2">در این حالت، خودرو فقط غیرفعال می‌شود و حذف فیزیکی انجام نمی‌شود.</p>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                دلیل حذف <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={deleteReason}
                                onChange={(e) => setDeleteReason(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                rows={3}
                                placeholder="دلیل حذف خودرو را وارد کنید..."
                                required
                            />
                        </div>

                        {dependencies && dependencies.hasDependencies ? (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    تغییر وضعیت به:
                                </label>
                                <select
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    <option value="حذف شده">حذف شده</option>
                                    <option value="اسقاط شده">اسقاط شده</option>
                                    <option value="فروخته شده">فروخته شده</option>
                                    <option value="غیرفعال">غیرفعال</option>
                                </select>
                            </div>
                        ) : dependencies && !dependencies.hasDependencies && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    نوع حذف:
                                </label>
                                <div className="space-y-3">
                                    <label className="flex items-start p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="deleteType"
                                            value="soft"
                                            checked={deleteType === 'soft'}
                                            onChange={(e) => setDeleteType(e.target.value as 'soft' | 'hard')}
                                            className="mt-1 mr-3"
                                        />
                                        <div>
                                            <div className="font-medium text-gray-900">حذف موقت (Soft Delete)</div>
                                            <div className="text-sm text-gray-600">خودرو غیرفعال می‌شود و امکان بازیابی وجود دارد</div>
                                        </div>
                                    </label>
                                    <label className="flex items-start p-3 border border-red-300 rounded-md cursor-pointer hover:bg-red-50">
                                        <input
                                            type="radio"
                                            name="deleteType"
                                            value="hard"
                                            checked={deleteType === 'hard'}
                                            onChange={(e) => setDeleteType(e.target.value as 'soft' | 'hard')}
                                            className="mt-1 mr-3"
                                        />
                                        <div>
                                            <div className="font-medium text-red-700">حذف کامل (Hard Delete)</div>
                                            <div className="text-sm text-red-600">⚠️ خودرو به طور دائمی حذف می‌شود و قابل بازیابی نیست</div>
                                        </div>
                                    </label>
                                </div>
                                
                                {deleteType === 'soft' && (
                                    <div className="mt-3">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            تغییر وضعیت به:
                                        </label>
                                        <select
                                            value={newStatus}
                                            onChange={(e) => setNewStatus(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                        >
                                            <option value="حذف شده">حذف شده</option>
                                            <option value="اسقاط شده">اسقاط شده</option>
                                            <option value="فروخته شده">فروخته شده</option>
                                            <option value="غیرفعال">غیرفعال</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowDeleteDialog(false);
                                    setVehicleToDelete(null);
                                    setDeleteReason('');
                                    setDependencies(null);
                                    setDeleteType('soft');
                                }}
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                disabled={deletingVehicle}
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className={`px-4 py-2 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed ${
                                    deleteType === 'hard' 
                                        ? 'bg-red-700 hover:bg-red-800' 
                                        : 'bg-red-500 hover:bg-red-600'
                                }`}
                                disabled={deletingVehicle || !deleteReason.trim()}
                            >
                                {deletingVehicle 
                                    ? 'در حال حذف...' 
                                    : deleteType === 'hard' 
                                        ? '⚠️ حذف دائمی' 
                                        : 'تایید حذف'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VehicleManagement;