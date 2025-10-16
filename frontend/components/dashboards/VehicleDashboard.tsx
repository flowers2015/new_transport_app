
import React, { useState, useMemo, useEffect } from 'react';
import { Vehicle, Branch, PlateNumber, VehicleStatus, VehicleCategory } from '../../types';
import { TruckIcon } from '../icons/CarIcon';
import { formatJalali, formatPlateNumber } from '../../utils/jalali';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';

interface VehicleManagementProps {
    vehicles: Vehicle[];
    branches: Branch[];
    onAddVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
    onUpdateVehicle?: (id: string, vehicle: Omit<Vehicle, 'id'>) => void;
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


const VehicleManagement: React.FC<VehicleManagementProps> = ({ vehicles, branches, onAddVehicle, onUpdateVehicle }) => {
    const [plate, setPlate] = useState<PlateNumber>({ part1: '', letter: 'الف', part2: '', cityCode: '' });
    const [serialNumber, setSerialNumber] = useState('');
    const [isPlate, setIsPlate] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    const initialFormState = {
        holdingCompany: '' as 'mihan' | 'other' | '',
        mihanCompany: '',
        vehicleCategory: '' as VehicleCategory | '',
        brand: '',
        model: '',
        vehicleTip: '',
        type: '',
        branchId: '',
        color: '',
        ownerName: '',
        cardId: '',
        vin: '',
        usageType: '',
        engineNumber: '',
        chassisNumber: '',
        capacity: '',
        year: '',
        wheelCount: '',
        axleCount: '',
        cylinderCount: '',
        domainName: '',
        fuelType: '',
        status: VehicleStatus.Active,
    };
    const [formState, setFormState] = useState(initialFormState);

    // --- Cascading Dropdown Logic ---
    const brands = useMemo(() => {
        return formState.vehicleCategory && vehicleDatabase[formState.vehicleCategory]
            ? Object.keys(vehicleDatabase[formState.vehicleCategory])
            : [];
    }, [formState.vehicleCategory]);

    const models = useMemo(() => {
        return formState.vehicleCategory && formState.brand && vehicleDatabase[formState.vehicleCategory]?.[formState.brand]
            ? Object.keys(vehicleDatabase[formState.vehicleCategory][formState.brand])
            : [];
    }, [formState.vehicleCategory, formState.brand]);

    const subModels = useMemo(() => {
        return formState.vehicleCategory && formState.brand && formState.model && vehicleDatabase[formState.vehicleCategory]?.[formState.brand]?.[formState.model]
            ? Object.keys(vehicleDatabase[formState.vehicleCategory][formState.brand][formState.model])
            : [];
    }, [formState.vehicleCategory, formState.brand, formState.model]);
    
    // --- Auto-population and Reset Logic ---
    useEffect(() => {
        const specs = formState.vehicleCategory && formState.brand && formState.model && formState.vehicleTip 
            ? vehicleDatabase[formState.vehicleCategory]?.[formState.brand]?.[formState.model]?.[formState.vehicleTip]
            : null;
        if (specs) {
            setFormState(prev => ({ ...prev, ...specs }));
        }
    }, [formState.vehicleTip]);
    
    const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newCategory = e.target.value as VehicleCategory;
        setFormState(prev => ({
            ...initialFormState,
            holdingCompany: prev.holdingCompany,
            mihanCompany: prev.mihanCompany,
            branchId: prev.branchId,
            vehicleCategory: newCategory,
        }));
    };

    const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newBrand = e.target.value;
        setFormState(prev => ({ ...prev, brand: newBrand, model: '', vehicleTip: '' }));
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newModel = e.target.value;
        setFormState(prev => ({ ...prev, model: newModel, vehicleTip: '' }));
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const updated: any = { ...formState, [name]: value };
        if (name === 'mihanCompany') {
            updated.ownerName = value || '';
        }
        setFormState(updated);
    };

    const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setPlate({ ...plate, [e.target.name]: e.target.value });
    };

    const resetForm = () => {
        setFormState(initialFormState);
        setPlate({ part1: '', letter: 'الف', part2: '', cityCode: '' });
        setSerialNumber('');
    };

    const handleCancel = () => {
        resetForm();
        setEditingId(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { branchId, model, holdingCompany, vehicleCategory, mihanCompany, year, wheelCount, axleCount, cylinderCount } = formState;

        if (!holdingCompany || !vehicleCategory || !branchId || !model) {
            alert('لطفا تمام فیلدهای ستاره دار را تکمیل کنید.');
            return;
        }
        if (holdingCompany === 'mihan' && !mihanCompany) {
            alert('لطفا شرکت زیرمجموعه هلدینگ میهن را انتخاب کنید.');
            return;
        }

        const vehicleData: Omit<Vehicle, 'id'> = {
            ...formState,
            holdingCompany: holdingCompany,
            vehicleCategory: vehicleCategory,
            model: [formState.model, formState.vehicleTip].filter(Boolean).join(' '),
            year: year ? parseInt(String(year)) : undefined,
            wheelCount: wheelCount ? parseInt(String(wheelCount)) : undefined,
            axleCount: axleCount ? parseInt(String(axleCount)) : undefined,
            cylinderCount: cylinderCount ? parseInt(String(cylinderCount)) : undefined,
            plateNumber: isPlate ? plate : undefined,
            serialNumber: !isPlate ? serialNumber : undefined,
            ownerName: holdingCompany === 'mihan' ? (formState.mihanCompany || '') : (formState.ownerName || '')
        };
        if (editingId) {
            if (onUpdateVehicle) {
                await onUpdateVehicle(editingId, vehicleData);
            }
        } else {
            onAddVehicle(vehicleData);
        }
        resetForm();
        setEditingId(null);
    };

    const getBranchName = (branchId: string) => branches.find(b => b.id === branchId)?.name || 'نامشخص';
    const handleEdit = (v: Vehicle) => {
        setEditingId(v.id);
        const baseModel = (v.model || '').trim();
        const knownTips = ['TU5','TU3','EF7','EF7T','K4M'];
        let modelName = baseModel;
        let tip = '';
        for (const t of knownTips) {
            if (baseModel.toLowerCase().includes(t.toLowerCase())) {
                modelName = baseModel.replace(new RegExp(t, 'i'), '').trim();
                tip = t;
                break;
            }
        }
        setFormState({
            holdingCompany: (v.holdingCompany as any) || '',
            mihanCompany: (v.mihanCompany as any) || '',
            vehicleCategory: (v.vehicleCategory as any) || '',
            brand: v.brand || '',
            model: modelName,
            vehicleTip: tip,
            type: v.type || '',
            branchId: v.branchId || '',
            color: (v as any).color || '',
            ownerName: v.ownerName || '',
            cardId: (v as any).cardId || '',
            vin: v.vin || '',
            usageType: (v as any).usageType || '',
            engineNumber: (v as any).engineNumber || '',
            chassisNumber: (v as any).chassisNumber || '',
            capacity: (v as any).capacity || '',
            year: v.year ? String(v.year) : '',
            wheelCount: (v as any).wheelCount ? String((v as any).wheelCount) : '',
            axleCount: (v as any).axleCount ? String((v as any).axleCount) : '',
            cylinderCount: (v as any).cylinderCount ? String((v as any).cylinderCount) : '',
            domainName: (v as any).domainName || '',
            fuelType: (v as any).fuelType || '',
            status: v.status || VehicleStatus.Active,
        } as any);
        if (v.plateNumber) {
            setIsPlate(true);
            setPlate(v.plateNumber);
            setSerialNumber('');
        } else {
            setIsPlate(false);
            setSerialNumber(v.serialNumber || '');
            setPlate({ part1: '', letter: 'الف', part2: '', cityCode: '' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

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

    const filteredVehicles = useMemo(() => {
        if (!searchTerm) return vehicles;
        const lowercasedTerm = searchTerm.toLowerCase();
        return vehicles.filter(v => {
            const vehicleFullName = [v.brand, v.model].filter(Boolean).join(' ').toLowerCase();
            return (
                (v.plateNumber && formatPlateNumber(v.plateNumber).toLowerCase().includes(lowercasedTerm)) ||
                (v.serialNumber && v.serialNumber.toLowerCase().includes(lowercasedTerm)) ||
                (vehicleFullName.includes(lowercasedTerm)) ||
                (v.ownerName && v.ownerName.toLowerCase().includes(lowercasedTerm))
            );
        });
    }, [searchTerm, vehicles]);
    
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
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <TruckIcon className="w-6 h-6 mr-2 text-sky-600" />
                    افزودن خودرو جدید
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">۱. انتخاب هلدینگ <span className="text-red-500">*</span></label>
                            <select name="holdingCompany" value={formState.holdingCompany} onChange={handleFormChange} className="mt-1 input-style" required>
                                <option value="">-- انتخاب کنید --</option>
                                <option value="mihan">هلدینگ میهن</option>
                                <option value="other">متفرقه</option>
                            </select>
                        </div>
                        {formState.holdingCompany && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700">۲. نوع وسیله نقلیه <span className="text-red-500">*</span></label>
                                <select name="vehicleCategory" value={formState.vehicleCategory} onChange={handleCategoryChange} className="mt-1 input-style" required>
                                    <option value="">-- انتخاب کنید --</option>
                                    {vehicleCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {formState.vehicleCategory && (
                        <>
                            {formState.holdingCompany === 'mihan' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">شرکت <span className="text-red-500">*</span></label>
                                    <select name="mihanCompany" value={formState.mihanCompany} onChange={handleFormChange} className="mt-1 input-style" required>
                                        <option value="">-- انتخاب کنید --</option>
                                        {mihanCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            )}

                            <fieldset className="p-4 border border-slate-200 rounded-lg">
                                <legend className="px-2 font-semibold text-slate-700">۳. شناسه و مدل خودرو</legend>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <div>
                                        <label className="block text-sm font-medium text-slate-700">برند <span className="text-red-500">*</span></label>
                                        <input list="brand-list" name="brand" value={formState.brand} onChange={handleBrandChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." required />
                                        <datalist id="brand-list">
                                            {brands.map(b => <option key={b} value={b} />)}
                                        </datalist>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">مدل اصلی <span className="text-red-500">*</span></label>
                                        <input list="model-list" name="model" value={formState.model} onChange={handleModelChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." required />
                                        <datalist id="model-list">
                                            {models.map(m => <option key={m} value={m} />)}
                                        </datalist>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">تیپ خودرو</label>
                                        <input list="submodel-list" name="vehicleTip" value={formState.vehicleTip} onChange={handleFormChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." />
                                        <datalist id="submodel-list">
                                            {subModels.map(sm => <option key={sm} value={sm} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div className="mt-4">
                                     <label className="block text-sm font-medium text-slate-700">شناسه اصلی</label>
                                     <div className="flex items-center gap-4 mt-1">
                                         <label><input type="radio" name="idType" checked={isPlate} onChange={() => setIsPlate(true)} /> پلاک</label>
                                         <label><input type="radio" name="idType" checked={!isPlate} onChange={() => setIsPlate(false)} /> شماره بدنه/سریال</label>
                                    </div>
                                    {isPlate ? (
                                         <div className="flex items-center gap-2 p-2 border rounded-lg bg-slate-50 mt-2">
                                            <span className="font-mono text-slate-500 pl-2">ایران</span>
                                            <input name="cityCode" value={plate.cityCode} onChange={handlePlateChange} placeholder="78" className="input-style w-12 text-center" maxLength={2} required={isPlate} />
                                            <span className="font-bold">-</span>
                                            <input name="part2" value={plate.part2} onChange={handlePlateChange} placeholder="956" className="input-style w-16 text-center" maxLength={3} required={isPlate} />
                                            <select name="letter" value={plate.letter} onChange={handlePlateChange} className="input-style w-16 text-center">
                                                {persianAlphabet.map(l => <option key={l} value={l}>{l}</option>)}
                                            </select>
                                            <input name="part1" value={plate.part1} onChange={handlePlateChange} placeholder="24" className="input-style w-12 text-center" maxLength={2} required={isPlate} />
                                        </div>
                                    ) : (
                                         <input name="serialNumber" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="شماره بدنه یا سریال دستگاه" className="input-style w-full mt-2" required={!isPlate} />
                                    )}
                                </div>
                            </fieldset>
                            
                            <fieldset className="p-4 border border-slate-200 rounded-lg">
                                <legend className="px-2 font-semibold text-slate-700">۴. مشخصات عمومی</legend>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">انتخاب شعبه <span className="text-red-500">*</span></label>
                                        <select name="branchId" value={formState.branchId} onChange={handleFormChange} className="mt-1 input-style" required>
                                            <option value="">-- انتخاب کنید --</option>
                                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">رنگ</label>
                                        <input name="color" value={formState.color} onChange={handleFormChange} list="color-list" className="mt-1 input-style" />
                                        <datalist id="color-list">
                                          {vehicleColors.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">وضعیت خودرو</label>
                                        <select name="status" value={formState.status} onChange={handleFormChange} className="mt-1 input-style">
                                            {Object.values(VehicleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>
                            
                            <fieldset className="p-4 border border-slate-200 rounded-lg">
                                <legend className="px-2 font-semibold text-slate-700">۵. مشخصات فنی و تکمیلی</legend>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">شماره VIN</label>
                                        <input name="vin" value={formState.vin} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">شماره شاسی</label>
                                        <input name="chassisNumber" value={formState.chassisNumber} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">شماره موتور</label>
                                        <input name="engineNumber" value={formState.engineNumber} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">سال ساخت</label>
                                        <input name="year" type="number" value={formState.year} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">نوع سوخت</label>
                                        <select name="fuelType" value={formState.fuelType} onChange={handleFormChange} className="input-style">
                                            <option value="">-- انتخاب کنید --</option>
                                            {fuelTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">تعداد سیلندر</label>
                                        <input name="cylinderCount" type="number" value={formState.cylinderCount} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">تعداد محور</label>
                                        <input name="axleCount" type="number" value={formState.axleCount} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">تعداد چرخ</label>
                                        <input name="wheelCount" type="number" value={formState.wheelCount} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">ظرفیت</label>
                                        <input name="capacity" value={formState.capacity} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">نوع کاربری</label>
                                        <input name="usageType" value={formState.usageType} onChange={handleFormChange} className="input-style" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">نام حوزه</label>
                                        <input name="domainName" value={formState.domainName} onChange={handleFormChange} className="input-style" />
                                    </div>
                                </div>
                            </fieldset>
                            
                            <div className="flex justify-end gap-2">
                                 <button type="button" onClick={handleCancel} className="px-5 py-2 rounded-md text-sm font-medium bg-gray-500 text-white hover:bg-gray-600 transition">انصراف</button>
                                 <button type="submit" className="px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">افزودن</button>
                            </div>
                        </>
                    )}
                </form>
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
                                <th className="px-6 py-3">شناسه</th>
                                <th className="px-6 py-3">مدل</th>
                                <th className="px-6 py-3">نام مالک</th>
                                <th className="px-6 py-3">شعبه</th>
                                <th className="px-6 py-3">وضعیت</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVehicles.map(vehicle => (
                                <React.Fragment key={vehicle.id}>
                                    <tr className="bg-white border-b hover:bg-gray-50">
                                        <th className="px-6 py-4 font-medium text-gray-900 font-mono">
                                            {vehicle.plateNumber ? formatPlateNumber(vehicle.plateNumber) : vehicle.serialNumber}
                                        </th>
                                        <td className="px-6 py-4">{[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}</td>
                                        <td className="px-6 py-4">{vehicle.ownerName || '-'}</td>
                                        <td className="px-6 py-4">{getBranchName(vehicle.branchId)}</td>
                                        <td className="px-6 py-4">
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
                                                <button onClick={() => handleEdit(vehicle)} className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">ویرایش</button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedVehicleId === vehicle.id && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={6} className="p-4">
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
        </div>
    );
};

export default VehicleManagement;