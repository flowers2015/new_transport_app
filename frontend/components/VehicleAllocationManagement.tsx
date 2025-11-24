
import React, { useState, useMemo, useEffect } from 'react';
import { Vehicle, Driver, Branch, VehicleAllocation, VehicleAllocationItem, VehicleAllocationStatus, User, VehicleCategory, PlateNumber } from '../types';
import { formatJalali, formatPlateNumber } from '../utils/jalali';
import { SwitchHorizontalIcon } from './icons/SwitchHorizontalIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { generateUUID } from '../utils/uuid';

interface VehicleAllocationManagementProps {
    vehicles: Vehicle[];
    drivers: Driver[];
    branches: Branch[];
    allocations: VehicleAllocation[];
    currentUser: User;
    onAddAllocation: (allocation: Omit<VehicleAllocation, 'id' | 'status' | 'returnDuration'>) => void;
    onUpdateAllocationStatus: (allocationId: string, status: VehicleAllocationStatus) => void;
}

const persianAlphabet = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی'];

const carChecklist = [
    { code: '1', description: 'شیشه ها', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '2', description: 'رادیو پخش', type: 'options', options: ['سالم', 'خراب'] },
    { code: '3', description: 'بلندگوها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '4', description: 'چراغ سقفی', type: 'options', options: ['سالم', 'خراب'] },
    { code: '5', description: 'آفتابگیرها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '6', description: 'کیف ابزار', type: 'options', options: ['دارد', 'ندارد'] },
    { code: '7', description: 'سوئیچ ها', type: 'options', options: ['یدک دارد', 'یدک ندارد'] },
    { code: '8', description: 'دزدگیر', type: 'options', options: ['قفل مرکزی', 'ریموت دار'] },
    { code: '9', description: 'چراغ های جلو', type: 'options', options: ['سالم', 'خراب'] },
    { code: '10', description: 'چراغ های عقب', type: 'options', options: ['سالم', 'خراب'] },
    { code: '11', description: 'راهنما ها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '12', description: 'پرژکتورها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '13', description: 'سپرها', type: 'options', options: ['سالم', 'ضربه خورده'] },
    { code: '14', description: 'آچارچرخ', type: 'quantity', defaultValue: '1' },
    { code: '15', description: 'آچار تخت', type: 'quantity', defaultValue: '2' },
    { code: '16', description: 'انبردست', type: 'quantity', defaultValue: '1' },
    { code: '17', description: 'زنجیرچرخ', type: 'quantity', defaultValue: '1' },
    { code: '18', description: 'دفترچه تعمیر ونگهداری', type: 'quantity', defaultValue: '1' },
    { code: '19', description: 'پیچ گوشتی چهارسو', type: 'quantity', defaultValue: '2' },
    { code: '20', description: 'پیچ گوشتی دوسو', type: 'quantity', defaultValue: '2' },
    { code: '21', description: 'مثلث شبرنگ', type: 'quantity', defaultValue: '1' },
    { code: '22', description: 'کپسول آتشنشانی', type: 'quantity', defaultValue: '1' },
    { code: '23', description: 'بیمه شخص ثالث', type: 'quantity', defaultValue: '1' },
    { code: '24', description: 'جک پژو پرشیا', type: 'quantity', defaultValue: '1' },
    { code: '25', description: 'دسته جک', type: 'quantity', defaultValue: '1' },
    { code: '26', description: 'زاپاس بارینگ', type: 'quantity', defaultValue: '1' },
    { code: '27', description: 'قفل فرمان', type: 'quantity', defaultValue: '1' },
    { code: '28', description: 'جعبه کمک های اولیه', type: 'quantity', defaultValue: '1' },
    { code: '29', description: 'فندک', type: 'quantity', defaultValue: '1' },
    { code: '30', description: 'جاسیگاری', type: 'quantity', defaultValue: '1' },
    { code: '31', description: 'کارت سوخت', type: 'quantity', defaultValue: '1' },
    { code: '32', description: 'کارت خودرو', type: 'quantity', defaultValue: '1' },
];

const mediumTruckChecklist = [
    { code: '100', description: 'شیشه ها', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '101', description: 'رادیو پخش', type: 'options', options: ['سالم', 'خراب'] },
    { code: '103', description: 'بلندگوها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '104', description: 'چراغ سقفی', type: 'options', options: ['سالم', 'خراب'] },
    { code: '105', description: 'آفتابگیرها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '106', description: 'کیف ابزار', type: 'options', options: ['دارد', 'ندارد'] },
    { code: '107', description: 'سوئیچ ها', type: 'options', options: ['یدک دارد', 'یدک ندارد'] },
    { code: '108', description: 'دزدگیر', type: 'options', options: ['قفل مرکزی', 'ریموت دار'] },
    { code: '109', description: 'چراغ های جلو', type: 'options', options: ['سالم', 'خراب'] },
    { code: '110', description: 'چراغ های عقب', type: 'options', options: ['سالم', 'خراب'] },
    { code: '111', description: 'چراغ راهنما های جلو', type: 'options', options: ['سالم', 'خراب'] },
    { code: '112', description: 'چراغ راهنما های عقب', type: 'options', options: ['سالم', 'خراب'] },
    { code: '113', description: 'پرژکتورها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '114', description: 'سپرها', type: 'options', options: ['سالم', 'ضربه خورده'] },
    { code: '115', description: 'بدنه یخچال خودرو', type: 'options', options: ['ضربه خورده', 'خط وخش دارد'] },
    { code: '116', description: 'کولر', type: 'options', options: ['خراب', 'سالم'] },
    { code: '117', description: 'گل پخش کن ها', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '118', description: 'دستگیره درب کابین خودرو', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '119', description: 'کابل برق', type: 'quantity', defaultValue: '1' },
    { code: '120', description: 'کمپرسور یونیت', type: 'quantity', defaultValue: '1' },
    { code: '121', description: 'آچارچرخ', type: 'quantity', defaultValue: '1' },
    { code: '122', description: 'زنجیرچرخ', type: 'quantity', defaultValue: '1' },
    { code: '123', description: 'انبردست', type: 'quantity', defaultValue: '1' },
    { code: '124', description: 'آچار فرانسه', type: 'quantity', defaultValue: '1' },
    { code: '125', description: 'آچارتخت', type: 'quantity', defaultValue: '2' },
    { code: '126', description: 'دفترچه تعمیر ونگهداری', type: 'quantity', defaultValue: '1' },
    { code: '127', description: 'پیچ گوشتی چهارسو', type: 'quantity', defaultValue: '2' },
    { code: '128', description: 'پیچ گوشتی دوسو', type: 'quantity', defaultValue: '2' },
    { code: '129', description: 'مثلث شبرنگ', type: 'quantity', defaultValue: '1' },
    { code: '130', description: 'کپسول آتشنشانی', type: 'quantity', defaultValue: '1' },
    { code: '131', description: 'بیمه شخص ثالث', type: 'quantity', defaultValue: '1' },
    { code: '132', description: 'جک 5و6تنی', type: 'quantity', defaultValue: '1' },
    { code: '133', description: 'دسته جک', type: 'quantity', defaultValue: '1' },
    { code: '134', description: 'زاپاس بارینگ', type: 'quantity', defaultValue: '1' },
    { code: '135', description: 'رابط آچار چرخ', type: 'quantity', defaultValue: '1' },
    { code: '136', description: 'کارت سوخت', type: 'quantity', defaultValue: '1' },
    { code: '137', description: 'کارت خودرو', type: 'quantity', defaultValue: '1' },
    { code: '138', description: 'قفل فرمان', type: 'quantity', defaultValue: '1' },
    { code: '139', description: 'جعبه کمک های اولیه', type: 'quantity', defaultValue: '1' },
    { code: '140', description: 'فندک', type: 'quantity', defaultValue: '1' },
    { code: '141', description: 'جاسیگاری', type: 'quantity', defaultValue: '1' },
    { code: '142', description: 'درب باک', type: 'quantity', defaultValue: '1' },
];

const heavyTruckChecklist = [
    { code: '200', description: 'شیشه ها', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '201', description: 'ضبط صوت', type: 'options', options: ['سالم', 'خراب'] },
    { code: '202', description: 'بلندگوها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '203', description: 'چراغ سقفی', type: 'options', options: ['سالم', 'خراب'] },
    { code: '204', description: 'آفتابگیرها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '205', description: 'کیف ابزار', type: 'options', options: ['دارد', 'ندارد'] },
    { code: '206', description: 'سوئیچ ها', type: 'options', options: ['یدک دارد', 'یدک ندارد'] },
    { code: '207', description: 'دزدگیر', type: 'options', options: ['قفل مرکزی', 'ریموت دار'] },
    { code: '208', description: 'چراغ های جلو', type: 'options', options: ['سالم', 'خراب'] },
    { code: '209', description: 'چراغ های عقب', type: 'options', options: ['سالم', 'خراب'] },
    { code: '210', description: 'چراغ راهنما های جلو', type: 'options', options: ['سالم', 'خراب'] },
    { code: '211', description: 'چراغ راهنما های عقب', type: 'options', options: ['سالم', 'خراب'] },
    { code: '212', description: 'پرژکتورها', type: 'options', options: ['سالم', 'خراب'] },
    { code: '213', description: 'سپرها', type: 'options', options: ['سالم', 'ضربه خورده'] },
    { code: '214', description: 'بدنه یخچال خودرو', type: 'options', options: ['ضربه خورده', 'خط وخش دارد'] },
    { code: '215', description: 'کولر', type: 'options', options: ['خراب', 'سالم'] },
    { code: '216', description: 'گل پخش کن ها', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '217', description: 'دستگیره درب کابین خودرو', type: 'options', options: ['سالم', 'شکسته'] },
    { code: '218', description: 'قفل', type: 'options', options: ['آویز', 'کتابی'] },
    { code: '219', description: 'کابل', type: 'options', options: ['کابل برق', 'کابل کمک باطری'] },
    { code: '220', description: 'میل رابط', type: 'options', options: ['میل رابط بلند', 'میل آچارچرخ اسکانیا'] },
    { code: '221', description: 'جعبه ابزار', type: 'options', options: ['ساک دستی', 'جعبه بکس'] },
    { code: '222', description: 'آچارچرخ', type: 'quantity', defaultValue: '1' },
    { code: '223', description: 'تالیور', type: 'quantity', defaultValue: '1' },
    { code: '224', description: 'زنجیرچرخ', type: 'quantity', defaultValue: '1' },
    { code: '225', description: 'سیم چین', type: 'quantity', defaultValue: '1' },
    { code: '226', description: 'انبردست', type: 'quantity', defaultValue: '1' },
    { code: '227', description: 'آچار فرانسه', type: 'quantity', defaultValue: '1' },
    { code: '228', description: 'آچارگیربکسی', type: 'quantity', defaultValue: '1' },
    { code: '229', description: 'آچارآلن ستاره ای', type: 'quantity', defaultValue: '1' },
    { code: '230', description: 'آچاردوسر', type: 'quantity', defaultValue: '2' },
    { code: '231', description: 'دفترچه تعمیر ونگهداری', type: 'quantity', defaultValue: '1' },
    { code: '232', description: 'پیچ گوشتی چهارسو', type: 'quantity', defaultValue: '2' },
    { code: '233', description: 'یپچ گوشتی دوسو', type: 'quantity', defaultValue: '2' },
    { code: '234', description: 'مثلث شبرنگ', type: 'quantity', defaultValue: '1' },
    { code: '235', description: 'گریس پمپ', type: 'quantity', defaultValue: '1' },
    { code: '236', description: 'کپسول آتشنشانی', type: 'quantity', defaultValue: '1' },
    { code: '237', description: 'بیمه شخص ثالث', type: 'quantity', defaultValue: '1' },
    { code: '238', description: 'شیلنگ باد متری', type: 'quantity', defaultValue: '1' },
    { code: '239', description: 'درجه باد', type: 'quantity', defaultValue: '1' },
    { code: '240', description: 'چراغ سیار', type: 'quantity', defaultValue: '1' },
    { code: '241', description: 'دنده پنج', type: 'quantity', defaultValue: '2' },
    { code: '242', description: 'کله قندی', type: 'quantity', defaultValue: '2' },
    { code: '243', description: 'چکش', type: 'quantity', defaultValue: '1' },
    { code: '244', description: 'جک روغنی 30تنی', type: 'quantity', defaultValue: '1' },
    { code: '245', description: 'دسته جک', type: 'quantity', defaultValue: '1' },
    { code: '246', description: 'دسته جک اتاق L آچار', type: 'options', options: ['آچار بالابر اتاق', 'دسته جک اتاق L آچار'] },
    { code: '247', description: 'صفحه تاخوگراف', type: 'options', options: ['دارد', 'ندارد'] },
    { code: '248', description: 'زاپاس بارینگ', type: 'quantity', defaultValue: '1' },
    { code: '249', description: 'رابط آچار چرخ', type: 'quantity', defaultValue: '1' },
    { code: '250', description: 'کارت سوخت', type: 'quantity', defaultValue: '1' },
    { code: '251', description: 'کارت خودرو', type: 'quantity', defaultValue: '1' },
    { code: '252', description: 'جعبه کمک های اولیه', type: 'quantity', defaultValue: '1' },
    { code: '253', description: 'فندک', type: 'quantity', defaultValue: '1' },
    { code: '254', description: 'جاسیگاری', type: 'quantity', defaultValue: '1' },
    { code: '255', description: 'درب باک', type: 'quantity', defaultValue: '1' },
];

const checklists = {
    [VehicleCategory.Car]: carChecklist,
    [VehicleCategory.Medium]: mediumTruckChecklist,
    [VehicleCategory.Heavy]: heavyTruckChecklist,
    [VehicleCategory.Pickup]: mediumTruckChecklist,
};

const VehicleAllocationManagement: React.FC<VehicleAllocationManagementProps> = ({ vehicles, drivers, branches, allocations, currentUser, onAddAllocation, onUpdateAllocationStatus }) => {
    const [processType, setProcessType] = useState<'delivery' | 'return' | null>(null);
    
    const [searchType, setSearchType] = useState<'plate' | 'serial'>('plate');
    const [plate, setPlate] = useState<PlateNumber>({ part1: '', letter: 'الف', part2: '', cityCode: '' });
    const [serialNumber, setSerialNumber] = useState('');
    const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
    
    const [deliveryState, setDeliveryState] = useState({ receiverId: '', mileage: '', deliveryType: 'temporary' as 'temporary' | 'permanent', newLocation: '', isSigned: false });
    const [returnState, setReturnState] = useState({ giverId: '', mileage: '', transactionTime: '' });
    
    const [items, setItems] = useState<VehicleAllocationItem[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    
    useEffect(() => {
        if (foundVehicle) {
            // Find the latest allocation for this vehicle to load its items
            const latestAllocation = [...allocations]
                .filter(a => a.vehicleId === foundVehicle.id)
                .sort((a, b) => b.allocationDate.getTime() - a.allocationDate.getTime())[0];

            if (latestAllocation) {
                 // Deep copy to prevent state mutation issues
                setItems(JSON.parse(JSON.stringify(latestAllocation.items)));
            } else {
                 // Generate from default checklist if no history
                const category = foundVehicle.vehicleCategory;
                const checklist = category ? checklists[category as keyof typeof checklists] : undefined;
                if (checklist) {
                    const initialItems = checklist.map(item => ({
                        id: generateUUID(),
                        code: item.code,
                        description: item.description,
                        value: item.type === 'quantity' ? (item.defaultValue || '1') : (item.options[0] || ''),
                        remarks: '',
                    }));
                    setItems(initialItems);
                } else {
                    setItems([{ id: generateUUID(), description: '', value: '1', remarks: '', code: '' }]);
                }
            }
        } else {
            setItems([]);
        }
    }, [foundVehicle, allocations]);


    const handleVehicleLookup = () => {
        let found: Vehicle | undefined;
        if (searchType === 'plate') {
            if (!plate.part1 || !plate.part2 || !plate.cityCode) {
                 alert('لطفا شماره پلاک را کامل وارد کنید.');
                 return;
            }
            const formattedPlate = formatPlateNumber(plate).replace(/\s/g, '');
            found = vehicles.find(v => v.plateNumber && formatPlateNumber(v.plateNumber).replace(/\s/g, '') === formattedPlate);

        } else { // searchType === 'serial'
            if (!serialNumber) return;
            const searchTerm = serialNumber.toLowerCase().trim();
            found = vehicles.find(v => 
                (v.serialNumber && v.serialNumber.toLowerCase().trim() === searchTerm) ||
                (v.vin && v.vin.toLowerCase().trim() === searchTerm)
            );
        }

        setFoundVehicle(found || null);
        if (!found) {
            alert('خودرویی با این شناسه یافت نشد.');
        }
    };
    
    const resetForm = () => {
        setProcessType(null);
        setSerialNumber('');
        setPlate({ part1: '', letter: 'الف', part2: '', cityCode: '' });
        setSearchType('plate');
        setFoundVehicle(null);
        setDeliveryState({ receiverId: '', mileage: '', deliveryType: 'temporary', newLocation: '', isSigned: false });
        setReturnState({ giverId: '', mileage: '', transactionTime: '' });
        setItems([]);
    };

    const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setPlate({ ...plate, [e.target.name]: e.target.value });
    };

    const handleItemChange = (id: string, field: 'description' | 'value' | 'remarks' | 'code', value: string) => {
        setItems(currentItems =>
            currentItems.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            )
        );
    };

    const addItemRow = () => setItems([...items, { id: generateUUID(), code: '', description: '', value: '1', remarks: '' }]);
    const removeItemRow = (id: string) => setItems(items.filter((item) => item.id !== id));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!foundVehicle || !processType || !currentUser.employeeId) return;

        if (processType === 'delivery') {
             if (!deliveryState.receiverId || !deliveryState.mileage || !deliveryState.newLocation) {
                alert('لطفا کد پرسنلی تحویل گیرنده، کیلومتر و محل استقرار جدید را وارد کنید.');
                return;
             }
             const allocationData: Omit<VehicleAllocation, 'id'|'status'|'returnDuration'> = {
                processType: 'delivery',
                vehicleId: foundVehicle.id,
                giverEmployeeId: currentUser.employeeId,
                receiverEmployeeId: deliveryState.receiverId,
                oldLocation: branches.find(b => b.id === foundVehicle.branchId)?.name || 'نامشخص',
                newLocation: branches.find(b => b.id === deliveryState.newLocation)?.name || 'نامشخص',
                allocationDate: new Date(),
                items: items,
                deliveryType: deliveryState.deliveryType,
                mileage: Number(deliveryState.mileage),
                isSigned: deliveryState.isSigned,
                expertName: currentUser.name,
            };
            onAddAllocation(allocationData);
        } else if (processType === 'return') {
            if (!returnState.giverId || !returnState.mileage || !returnState.transactionTime) {
                alert('لطفا کد پرسنلی تحویل دهنده، کیلومتر و زمان رسید را وارد کنید.');
                return;
            }
             const allocationData: Omit<VehicleAllocation, 'id'|'status'|'returnDuration'> = {
                processType: 'return',
                vehicleId: foundVehicle.id,
                giverEmployeeId: returnState.giverId,
                receiverEmployeeId: currentUser.employeeId,
                oldLocation: `در اختیار ${getDriverName(returnState.giverId)}`,
                newLocation: branches.find(b => b.id === foundVehicle.branchId)?.name || 'نامشخص',
                allocationDate: new Date(),
                transactionTime: returnState.transactionTime,
                items: items,
                mileage: Number(returnState.mileage),
                isSigned: true, // Expert confirms receipt
                expertName: currentUser.name,
            };
            onAddAllocation(allocationData);
        }
        
        resetForm();
    };
    
    const getDriver = (employeeId: string) => drivers.find(d => d.employeeId === employeeId);
    const getDriverName = (employeeId: string) => getDriver(employeeId)?.name || employeeId;
    
    const getVehicleIdentifier = (vehicleId: string) => {
         const v = vehicles.find(v => v.id === vehicleId);
         return v ? (v.plateNumber ? formatPlateNumber(v.plateNumber) : v.serialNumber) : 'نامشخص';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <SwitchHorizontalIcon className="w-6 h-6 mr-2 text-sky-600" />
                    ثبت تغییر و تحول خودرو
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Step 1: Process Type */}
                    <div className="p-4 border rounded-lg bg-slate-50 space-y-2">
                         <label className="text-sm font-medium text-slate-700">۱. نوع عملیات را انتخاب کنید</label>
                         <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer text-base p-2">
                                <input type="radio" name="processType" value="delivery" checked={processType === 'delivery'} onChange={(e) => { resetForm(); setProcessType(e.target.value as any); }} />
                                ثبت تخصیص خودرو (تحویل)
                            </label>
                             <label className="flex items-center gap-2 cursor-pointer text-base p-2">
                                <input type="radio" name="processType" value="return" checked={processType === 'return'} onChange={(e) => { resetForm(); setProcessType(e.target.value as any); }} />
                                ثبت رسید خودرو (برگشت)
                            </label>
                         </div>
                    </div>

                    {processType && (
                    <>
                        {/* Step 2: Vehicle Search */}
                        <div className="p-3 border rounded-lg bg-slate-50 space-y-3">
                            <label className="text-sm font-medium">۲. جستجوی خودرو</label>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="searchType" value="plate" checked={searchType === 'plate'} onChange={() => setSearchType('plate')} /><span>بر اساس پلاک</span></label>
                                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="searchType" value="serial" checked={searchType === 'serial'} onChange={() => setSearchType('serial')} /><span>بر اساس شماره بدنه/سریال</span></label>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-grow">
                                    {searchType === 'plate' ? (
                                        <div className="flex items-center gap-2 p-2 border rounded-lg bg-white">
                                            <span className="font-mono text-slate-500 pl-2">ایران</span>
                                            <input name="cityCode" value={plate.cityCode} onChange={handlePlateChange} placeholder="78" className="input-style w-12 text-center" maxLength={2} disabled={!!foundVehicle}/>
                                            <span className="font-bold">-</span>
                                            <input name="part2" value={plate.part2} onChange={handlePlateChange} placeholder="956" className="input-style w-16 text-center" maxLength={3} disabled={!!foundVehicle}/>
                                            <select name="letter" value={plate.letter} onChange={handlePlateChange} className="input-style w-16 text-center" disabled={!!foundVehicle}>{persianAlphabet.map(l => <option key={l} value={l}>{l}</option>)}</select>
                                            <input name="part1" value={plate.part1} onChange={handlePlateChange} placeholder="24" className="input-style w-12 text-center" maxLength={2} disabled={!!foundVehicle}/>
                                        </div>
                                    ) : (
                                        <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="شماره بدنه یا سریال دستگاه را وارد کنید" className="input-style" disabled={!!foundVehicle}/>
                                    )}
                                </div>
                                <button type="button" onClick={handleVehicleLookup} className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm" disabled={!!foundVehicle}>یافتن</button>
                            </div>
                        </div>
                    </>
                    )}

                    {foundVehicle && processType === 'delivery' && (
                        <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                            <h3 className="text-md font-bold text-slate-800">فرم تحویل خودرو</h3>
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div><label className="text-xs">کارشناس ترابری</label><p className="font-semibold">{currentUser.name}</p></div>
                                <div><label className="text-xs">تاریخ تحویل</label><p className="font-semibold">{formatJalali(new Date())}</p></div>
                                <div><label className="text-xs">شرکت</label><p className="font-semibold">{foundVehicle.mihanCompany || foundVehicle.holdingCompany}</p></div>
                             </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
                                <div><label className="text-sm font-medium">کد پرسنلی تحویل گیرنده</label><input list="drivers-list" value={deliveryState.receiverId} onChange={e => setDeliveryState(s => ({...s, receiverId: e.target.value}))} className="input-style mt-1" required /></div>
                                <div><label className="text-sm font-medium">کیلومتر تحویل</label><input type="number" value={deliveryState.mileage} onChange={e => setDeliveryState(s => ({...s, mileage: e.target.value}))} className="input-style mt-1" required /></div>
                                <div><label className="text-sm font-medium">محل استقرار جدید</label><select value={deliveryState.newLocation} onChange={e => setDeliveryState(s=>({...s, newLocation: e.target.value}))} className="input-style mt-1" required><option value="">-- انتخاب شعبه --</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                            </div>
                             <div className="pt-3 border-t">
                                <label className="text-sm font-medium">نوع تحویل</label>
                                <div className="flex items-center gap-4 mt-1"><label className="flex items-center gap-1"><input type="radio" value="temporary" checked={deliveryState.deliveryType === 'temporary'} onChange={e => setDeliveryState(s => ({...s, deliveryType: e.target.value as any}))}/> تحویل موقت</label><label className="flex items-center gap-1"><input type="radio" value="permanent" checked={deliveryState.deliveryType === 'permanent'} onChange={e => setDeliveryState(s => ({...s, deliveryType: e.target.value as any}))}/> تحویل دائم</label></div>
                            </div>
                        </div>
                    )}

                    {foundVehicle && processType === 'return' && (
                        <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                            <h3 className="text-md font-bold text-slate-800">فرم رسید خودرو (برگشت)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div><label className="text-xs">کارشناس تحویل گیرنده</label><p className="font-semibold">{currentUser.name}</p></div>
                                <div><label className="text-xs">تاریخ رسید</label><p className="font-semibold">{formatJalali(new Date())}</p></div>
                             </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
                                <div><label className="text-sm font-medium">کد پرسنلی تحویل دهنده</label><input list="drivers-list" value={returnState.giverId} onChange={e => setReturnState(s => ({...s, giverId: e.target.value}))} className="input-style mt-1" required /></div>
                                <div><label className="text-sm font-medium">کیلومتر فعلی</label><input type="number" value={returnState.mileage} onChange={e => setReturnState(s => ({...s, mileage: e.target.value}))} className="input-style mt-1" required /></div>
                                <div><label className="text-sm font-medium">زمان رسید</label><input type="time" value={returnState.transactionTime} onChange={e => setReturnState(s => ({...s, transactionTime: e.target.value}))} className="input-style mt-1" required /></div>
                            </div>
                        </div>
                    )}

                    {foundVehicle && (
                    <>
                        <datalist id="drivers-list">{drivers.map(d=><option key={d.id} value={d.employeeId}>{d.name}</option>)}</datalist>
                        <div className="p-3 border rounded-lg bg-slate-50">
                            <label className="text-sm font-medium mb-2 block">اقلام و وضعیت خودرو</label>
                            <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-600 px-2">
                                    <div className="col-span-1">کد</div><div className="col-span-4">آیتم</div><div className="col-span-3">حالت/تعداد</div><div className="col-span-3">توضیحات</div><div className="col-span-1"></div>
                                </div>
                                {items.map((item) => {
                                    const checklist = foundVehicle?.vehicleCategory ? checklists[foundVehicle.vehicleCategory as keyof typeof checklists] : undefined;
                                    const itemDef = checklist?.find(c => c.code === item.code);
                                    return (
                                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-1"><input value={item.code || ''} onChange={e => handleItemChange(item.id, 'code', e.target.value)} className="input-style text-sm" disabled={!!itemDef}/></div>
                                            <div className="col-span-4"><input value={item.description} onChange={e => handleItemChange(item.id, 'description', e.target.value)} className="input-style text-sm" disabled={!!itemDef} /></div>
                                            <div className="col-span-3">
                                                {itemDef?.type === 'options' ? (<select value={item.value} onChange={e => handleItemChange(item.id, 'value', e.target.value)} className="input-style text-sm">{itemDef.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>) 
                                                : (<input type={itemDef?.type === 'quantity' ? 'number' : 'text'} value={item.value} onChange={e => handleItemChange(item.id, 'value', e.target.value)} className="input-style text-sm"/>)}
                                            </div>
                                            <div className="col-span-3"><input value={item.remarks} onChange={e => handleItemChange(item.id, 'remarks', e.target.value)} placeholder="توضیحات..." className="input-style text-sm"/></div>
                                            <div className="col-span-1 text-center"><button type="button" onClick={() => removeItemRow(item.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">حذف</button></div>
                                        </div>
                                    );
                                })}
                            </div>
                            <button type="button" onClick={addItemRow} className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-xs mt-4">+ افزودن ردیف</button>
                        </div>
                        {processType === 'delivery' && 
                            <div className="p-3 border rounded-lg bg-slate-50">
                                <label className="flex items-center gap-2 cursor-pointer font-semibold"><input type="checkbox" checked={deliveryState.isSigned} onChange={e => setDeliveryState(s => ({...s, isSigned: e.target.checked}))} /> تایید و امضای تحویل گیرنده</label>
                            </div>
                        }
                        <div className="flex justify-end gap-2"><button type="button" onClick={resetForm} className="px-4 py-2 bg-slate-200 text-slate-800 rounded text-sm">انصراف</button><button type="submit" className="px-6 py-2 bg-sky-600 text-white rounded text-sm">ثبت فرم</button></div>
                    </>
                    )}
                </form>
            </div>
            
             <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4">تاریخچه تخصیص‌ها</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="text-xs uppercase bg-gray-50"><tr className="text-slate-600">
                            <th className="p-3"></th><th className="p-3">خودرو</th><th className="p-3">عملیات</th><th className="p-3">راننده</th><th className="p-3">کارشناس</th><th className="p-3">تاریخ</th><th className="p-3">مدت تخصیص</th>
                        </tr></thead>
                        <tbody>
                            {[...allocations].sort((a,b) => b.allocationDate.getTime() - a.allocationDate.getTime()).map(alloc => {
                                const isDelivery = alloc.processType === 'delivery';
                                const driverId = isDelivery ? alloc.receiverEmployeeId : alloc.giverEmployeeId;
                                return (
                                <React.Fragment key={alloc.id}>
                                    <tr className="border-b hover:bg-slate-50">
                                        <td><button onClick={()=>setExpandedId(p => p === alloc.id ? null : alloc.id)}><ChevronDownIcon className={`w-5 h-5 transition-transform ${expandedId === alloc.id ? 'rotate-180' : ''}`} /></button></td>
                                        <td className="p-3 font-mono">{getVehicleIdentifier(alloc.vehicleId)}</td>
                                        <td className="p-3 text-xs"><span className={`px-2 py-1 rounded-full font-semibold ${isDelivery ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{isDelivery ? 'تحویل' : 'برگشت'}</span></td>
                                        <td className="p-3">{getDriverName(driverId)}</td>
                                        <td className="p-3">{alloc.expertName}</td>
                                        <td className="p-3">{formatJalali(alloc.allocationDate)}</td>
                                        <td className="p-3">{alloc.returnDuration || '-'}</td>
                                    </tr>
                                    {expandedId === alloc.id && (
                                    <tr className="bg-slate-100"><td colSpan={7} className="p-4">
                                        <h4 className="font-bold mb-2">جزئیات تخصیص</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                            <p><strong>{isDelivery ? 'از:' : 'به:'}</strong> {isDelivery ? alloc.oldLocation : alloc.newLocation}</p>
                                            <p><strong>{isDelivery ? 'به:' : 'از:'}</strong> {isDelivery ? alloc.newLocation : alloc.oldLocation}</p>
                                            <p><strong>کیلومتر:</strong> {alloc.mileage.toLocaleString('fa-IR')}</p>
                                            {alloc.deliveryType && <p><strong>نوع تحویل:</strong> {alloc.deliveryType === 'permanent' ? 'دائم' : 'موقت'}</p>}
                                            {alloc.transactionTime && <p><strong>زمان برگشت:</strong> {alloc.transactionTime}</p>}
                                        </div>
                                        <h5 className="font-semibold mb-1 text-sm">اقلام همراه</h5>
                                        <div className="overflow-x-auto bg-white rounded border max-h-60">
                                            <table className="w-full text-xs text-right">
                                                <thead className="bg-slate-200 sticky top-0"><tr><th className="p-2">کد</th><th className="p-2">شرح</th><th className="p-2">وضعیت/تعداد</th><th className="p-2">ملاحظات</th></tr></thead>
                                                <tbody>{alloc.items.map(item => (<tr key={item.id} className="border-b"><td className="p-2 font-mono">{item.code || '-'}</td><td className="p-2">{item.description}</td><td className="p-2">{item.value}</td><td className="p-2">{item.remarks || '-'}</td></tr>))}</tbody>
                                            </table>
                                        </div>
                                    </td></tr>
                                    )}
                                </React.Fragment>
                            )})}
                        </tbody>
                    </table>
                </div>
             </div>
             <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default VehicleAllocationManagement;