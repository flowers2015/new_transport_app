export enum View {
    Login = 'login',
    Dashboard = 'dashboard',
    Branches = 'branches',
    Vehicles = 'vehicles',
    Drivers = 'drivers',
    Technicians = 'technicians',
    Inventory = 'inventory',
    Purchasing = 'purchasing',
    NewRepairOrder = 'new-repair-order',
    RepairOrder = 'repair-order',
    Alerts = 'alerts',
    PartUsageReport = 'part-usage-report',
    CostReport = 'cost-report',
    Suppliers = 'suppliers',
    Outsourcing = 'outsourcing',
    Invoices = 'invoices',
    NewInvoice = 'new-invoice',
    InvoiceDetail = 'invoice-detail',
    AuditTrail = 'audit-trail',
    SupportTickets = 'support-tickets',
    VehicleDocuments = 'vehicle-documents',
    Insurance = 'insurance',
    VehicleAllocation = 'vehicle-allocation',
    // New Freight Views
    FreightPlanning = 'freight-planning',
    TransportLive = 'transport-live',
    FreightFinance = 'freight-finance',
    FreightHistory = 'freight-history',
    TransportDashboard = 'transport-dashboard',
    TransportDispatchQueue = 'transport-dispatch-queue',
    TransportDispatchAssignment = 'transport-dispatch-assignment',
    TransportDispatchBoard = 'transport-dispatch-board',
}

export enum UserRole {
    Admin = 'ادمین',
    Merchant = 'بازرگان',
    Warehouse = 'انبار',
    Transportation = 'ترابری',
    Workshop = 'تعمیرگاه',
    BranchFinance = 'مالی شعب',
    HQFinance = 'مالی ستاد',
    VehicleDocumentsExpert = 'کارشناس مدارک خودرو',
    AccidentExpert = 'کارشناس تصادفات',
    VehicleAllocationExpert = 'کارشناس تغییر و تحول',
    InsuranceExpert = 'کارشناس بیمه',
    // New Freight Roles
    PlanningEmployee = 'کارمند برنامه‌ریزی',
    PlanningManager = 'مدیر برنامه‌ریزی',
    TransportationUser = 'کاربر ترابری (شرکت)',
    Transportation_Personal_Vehicle_User = 'کاربر ترابری (خودرو شخصی)',
    CentralFinance = 'مالی مرکزی',
    TransportationFinance = 'مالی ترابری',
}

export interface User {
    id: string;
    username: string;
    password?: string; // Should not be stored in frontend state in a real app
    name: string;
    role: UserRole;
    employeeId?: string;
    branchCity?: string; // For Branch_Finance role
}

export enum RepairStatus {
    New = 'جدید',
    Diagnosing = 'در انتظار عیب‌یابی',
    AwaitingPart = 'در انتظار قطعه',
    InProgress = 'در حال انجام',
    OnHold = 'متوقف',
    Completed = 'تکمیل شده',
    Delivered = 'تحویل شده',
    Closed = 'بسته شده',
}

export enum TaskStatus {
    Pending = 'در انتظار',
    InProgress = 'در حال انجام',
    Completed = 'تکمیل شده',
}

export enum InvoiceStatus {
    Pending = 'در انتظار پرداخت',
    Paid = 'پرداخت شده',
    Overdue = 'معوق',
}

export enum PurchaseOrderStatus {
    Draft = 'پیش‌نویس',
    Ordered = 'سفارش داده شده',
    Received = 'دریافت شده',
}

export enum OutsourcingStatus {
    PendingQuote = 'در انتظار قیمت',
    InProgress = 'ارسال شده به تامین‌کننده',
    Completed = 'تکمیل و بازگشت',
    Cancelled = 'لغو شده',
}

export enum VehicleStatus {
    Active = 'فعال',
    Sold = 'فروخته شده',
    Scrapped = 'اسقاط',
}

export enum VehicleCategory {
    Heavy = 'خودرو سنگین',
    Medium = 'خودرو نیمه سنگین',
    Car = 'سواری',
    Trailer = 'نیمه یدک (تریلر)',
    Flatbed = 'نیمه یدک (کفی و چادری)',
    Tanker = 'نیمه یدک (تانکر)',
    Pickup = 'وانت',
    Agricultural = 'ادوات کشاورزی',
    Construction = 'ادوات راه سازی و پروژه ای',
    Motorcycle = 'موتور سیکلت',
    Forklift = 'لیفتراک',
}

export enum SupportTicketStatus {
    Open = 'باز',
    InProgress = 'در حال بررسی',
    Closed = 'بسته شده',
}

export enum LicenseType {
    Base1 = 'پایه یک',
    Base2 = 'پایه دو',
    Base3 = 'پایه سوم',
    Motorcycle = 'موتورسیکلت',
}

export enum InsuranceType {
    ThirdParty = 'شخص ثالث',
    Body = 'بدنه',
}

export enum FaultParty {
    Company = 'شرکت',
    ThirdParty = 'طرف مقابل',
    Unknown = 'نامشخص',
}

export enum AccidentStatus {
    NewReport = 'گزارش جدید',
    ExpertReview = 'در دست بررسی کارشناس',
    FileComplete = 'پرونده تکمیل',
    ReferredToWorkshop = 'ارجاع به تعمیرگاه',
    WorkshopInProgress = 'در دست تعمیر',
    WorkshopComplete = 'تعمیرات تکمیل',
    AwaitingPayment = 'در انتظار پرداخت',
    Closed = 'بسته شده',
}

// --- Freight Management Enums ---
export enum FreightAnnouncementStatus {
    Draft = 'پیش‌نویس',
    PendingManagerApproval = 'در انتظار تایید مدیر',
    Rejected = 'رد شده',
    PendingPersonalAssignment = 'در انتظار تخصیص (شخصی)',
    PendingCompanyAssignment = 'در انتظار تخصیص (شرکت)',
    Assigned = 'تخصیص یافته',
    InTransit = 'در حال حمل',
    Finalized = 'نهایی شده',
    Cancelled = 'لغو شده',
    ReAnnounced = 'اعلام مجدد شده',
    Leftover = 'بار مانده',
    ChangeRequested = 'درخواست تغییر',
    Archived = 'بایگانی شده',
}


export enum FreightLineType {
    IceCream = 'بستنی',
    Dairy = 'پاستوریزه',
    Ambient = 'لبنیات-فروتلند',
}

export enum FreightPaymentStatus {
    Unpaid = 'پرداخت نشده',
    Paid = 'پرداخت شده',
}


// --- New Branch-Centric Entities ---

export interface Branch {
    id: string;
    name: string;
    location: string;
}

export interface PlateNumber {
    part1: string; // 2 digits
    letter: string;
    part2: string; // 3 digits
    cityCode: string; // 2 digits
}

export interface OwnerHistory {
    id: string;
    ownerName: string;
    startDate: Date;
    endDate: Date;
}

export interface Vehicle {
    id: string;
    plateNumber?: PlateNumber;
    serialNumber?: string; // For forklifts, etc.
    model: string;
    type?: string; // e.g., 'Truck', 'Crane', 'Loader'
    branchId: string;
    // New fields
    holdingCompany?: 'mihan' | 'other';
    mihanCompany?: 'پخش سراسری میهن' | 'شهرنوشیدنی' | 'پاندا' | 'کارخانه میهن' | string;
    vehicleCategory?: VehicleCategory;
    brand?: string;
    color?: string;
    ownerName?: string;
    cardId?: string;
    vin?: string;
    usageType?: string;
    province?: string;
    engineNumber?: string;
    vehicleTip?: string; // "Tip" is "تیپ" in Persian
    chassisNumber?: string;
    capacity?: string;
    year?: number;
    wheelCount?: number;
    axleCount?: number;
    cylinderCount?: number;
    domainName?: string; // "حوزه"
    fuelType?: string;
    vehicleCode?: string; // کد خودرو برای سنگین/نیمه یدک
    status?: VehicleStatus;
    // Detailed specs from user request
    enginePower?: number;
    torque?: number;
    emissionStandard?: string;
    engineModel?: string;
    gearboxModel?: string;
    gearCount?: number | string;
    length?: number;
    width?: number;
    grossWeight?: number;
    netWeight?: number;
    brakeSystem?: string;
    marketPrice?: string;
    productionModel?: string;
    advantages?: string;
    disadvantages?: string;
    leasingConditions?: string;
    ownerHistory?: OwnerHistory[];
}

export interface Driver {
    id:string;
    employeeId: string; // کد پرسنلی
    name: string; // نام و نام خانوادگی
    fatherName?: string; // نام پدر
    nationalId: string; // کدملی
    birthDate?: Date; // تاریخ تولد
    idNumber?: string; // شماره شناسنامه
    birthPlace?: string; // محل تولد
    issuePlace?: string; // محل صدور شناسنامه
    homePhone?: string; // تلفن منزل
    workPhone?: string; // تلفن محل کار
    mobile: string; // همراه
    postalCode?: string; // کد پستی
    homeAddress?: string; // آدرس منزل
    workLocation?: string; // محل خدمت
    jobTitle?: string; // شغل
    hireDate?: Date; // تاریخ استخدام
    terminationDate?: Date; // تاریخ تسویه حساب
    licenseNumber?: string; // شماره گواهینامه
    licenseType?: LicenseType; // نوع گواهینامه
    licenseIssueDate?: Date; // تاریخ صدور گواهینامه
    licenseIssuePlace?: string; // محل صدور گواهینامه
    licenseExpiryDate?: Date; // مدت اعتبار گواهینامه
    // For personal transport
    currentVehicleType?: string;
    currentVehiclePlate?: string;
}

export interface PersonalDriver {
    id: string;
    nationalId: string;
    name: string;
    mobile: string;
    driverSmartId: string;
    createdAt: string;
    updatedAt?: string;
}

export interface PersonalVehicle {
    id: string;
    truckSmartId: string;
    platePart1: string;
    plateLetter: string;
    platePart2: string;
    plateCityCode: string;
    vehicleType: string;
    vehicleUsage?: string;
    formattedPlate: string;
    createdAt: string;
    updatedAt?: string;
}

export interface Technician {
    id: string;
    name: string;
    employeeId: string;
    skills: string[];
}

// --- Core Entities ---

export interface RepairOrder {
    id: string;
    vehicleId: string;
    driverId: string;
    branchId: string; // Denormalized for easier access
    description: string;
    status: RepairStatus;
    priority: 'High' | 'Normal' | 'Low';
    createdAt: Date;
    completedAt?: Date;
    assignedTechnicianId?: string;
    outsourcingRequestId?: string;
}

export interface Task {
    id: string;
    repairOrderId: string;
    technicianId: string;
    description: string;
    estimatedHours: number;
    actualHours?: number;
    status: TaskStatus;
}

export interface Part {
    id: string;
    name: string;
    partNumber: string;
    quantityInStock: number;
    price: number;
    minStockLevel: number;
    location?: string;
    warehouseCode?: string;
    batchNumber?: string;
    expiryDate?: Date;
}

export interface PartUsage {
    id: string;
    repairOrderId: string;
    partId: string;
    quantityUsed: number;
    usageDate: Date;
    // For reporting
    branchId: string;
    vehicleId: string;
}

export interface Invoice {
    id: string;
    repairOrderId?: string;
    vehicleId: string;
    totalAmount: number;
    status: InvoiceStatus;
    issuedAt: Date;
    items: {
        partId?: string;
        description: string;
        quantity: number;
        price: number;
        total: number;
    }[];
}

export interface Alert {
    id: string;
    type: 'PotentialOveruse' | 'LowStock' | 'ExpiredPart';
    message: string;
    date: Date;
    vehicleId?: string;
    partId: string;
}

// --- Purchasing & Inventory Workflow ---

export interface Supplier {
    id: string;
    name: string;
    contactPerson: string;
}

export interface PurchaseOrder {
    id: string;
    supplierId: string;
    orderDate: Date;
    expectedDeliveryDate: Date;
    status: PurchaseOrderStatus;
    items: { partId: string; quantity: number }[];
}

export interface StockMovement {
    id: string;
    partId: string;
    quantity: number; // Positive for incoming, negative for outgoing
    type: 'reception' | 'usage';
    referenceId: string; // PO id or RepairOrder id
    date: Date;
}

// --- Outsourcing ---
export interface OutsourcingRequest {
    id: string;
    repairOrderId: string;
    supplierId: string;
    status: OutsourcingStatus;
    sentDate: Date;
    quoteAmount?: number;
    returnDate?: Date;
}

// --- Support ---
export interface SupportTicket {
    id: string;
    subject: string;
    description: string;
    status: SupportTicketStatus;
    createdAt: Date;
    createdByUserId: string;
    createdByUserName: string;
}

// --- BI & Auditing ---

export interface AuditLog {
    id: string;
    timestamp: Date;
    userId: string;
    userName: string;
    action: string;
    details: string;
}

export type DrillDownInfo = {
    type: 'branchCost';
    branchId: string;
    startDate: string;
    endDate: string;
} | null;

// --- Vehicle Documents ---

export interface FuelCardRequest {
    id: string;
    vehicleId: string;
    branchId: string;
    requestDate: Date;
    issueDate?: Date;
}

export interface TrafficFine {
    id: string;
    vehicleId: string;
    branchId: string;
    amount: number; // In Rials
    fineDate: Date;
}

export interface VehiclePermit {
    id: string;
    vehicleId: string;
    branchId: string;
    requestDate: Date;
    permitIssueDate: Date;
    permitExpiryDate: Date;
    baseFuelQuota: number;
    inspectionImageName?: string;
    permitImageName?: string;
    inspectionIssueDate: Date;
    inspectionExpiryDate: Date;
}

// --- Insurance Module ---

export interface InsurancePolicy {
    id: string;
    vehicleId: string;
    type: InsuranceType;
    policyNumber: string;
    insuranceCompany: string;
    startDate: Date;
    endDate: Date;
    // Specific fields
    vehicleValue?: number; // بدنه
    franchisePercentage?: number; // بدنه
    policyImageName?: string;
    // New fields
    discountYears?: number;
    discountPercentage?: number;
    policyAmount?: number;
}

export enum AccidentFileType {
    ThirdParty = 'ثالث',
    Body = 'بدنه',
    ThirdPartyBody = 'ثالث-بدنه',
}

export enum ReconstructionLocation {
    Mammut = 'ماموت',
    AryaDiesel = 'آریا دیزل',
    Organization = 'تعمیرگاه سازمان',
    Personal = 'شخصی',
}

export enum FileProgressStatus {
    AwaitingVisit = 'در انتظار بازدید',
    AwaitingInvoice = 'در انتظار فاکتور',
    AwaitingVoucher = 'در انتظار دریافت حواله از بیمه',
    AwaitingFinancialApproval = 'در انتظار تایید مالی',
    NotPaid = 'عدم واریز خسارت',
    Paid = 'خسارت واریز شده',
}

export interface AccidentReport {
    id: string;
    vehicleId: string;
    driverId: string;
    branchId: string;
    status: AccidentStatus;

    // Accident Details
    accidentDate: Date;
    accidentTime: string;
    accidentLocation: string;
    accidentCause: string;
    wasInjury: boolean;
    atFaultParty: FaultParty;
    vehiclePostAccidentLocation: string;
    
    // Uploaded Documents (just storing names for mock)
    accidentSketchImageName?: string;
    companyDriverLicenseImageName?: string;
    thirdPartyDriverLicenseImageName?: string;
    damagedVehicleImageName?: string;
    
    // Expert Review fields
    fileCompletionDate?: Date;
    fileCompletionDelayReason?: string;
    claimFileNumber?: string;
    referralToWorkshopDate?: Date;
    paymentVoucherImageName?: string;

    // New fields for Insurance Expert
    fileType?: AccidentFileType;
    reconstructionLocation?: ReconstructionLocation;
    personalReconstructionLocation?: string;
    fileProgressStatus?: FileProgressStatus;
    claimAmountReceived?: number;
    franchiseAmount?: number;
    // New fields for workshop and finance
    repairInvoiceAmount?: number;
    depreciationAmount?: number;
    franchiseProcessNumber?: string;
    awaitingRepairDate?: Date;
    repairInProgressDate?: Date;
    repairCompletedDate?: Date;
}

// --- Vehicle Allocation ---
export interface VehicleAllocationItem {
    id: string;
    code?: string;
    description: string;
    value: string; // Can be a status string ('سالم') or a numeric string ('1')
    remarks: string;
}

export enum VehicleAllocationStatus {
    Draft = 'پیش‌نویس',
    PendingGiverConfirm = 'در انتظار تایید تحویل‌دهنده',
    PendingReceiverConfirm = 'در انتظار تایید تحویل‌گیرنده',
    Completed = 'تکمیل شده',
}

export interface VehicleAllocation {
    id: string;
    vehicleId: string;
    giverEmployeeId: string; // Person handing over (expert or driver)
    receiverEmployeeId: string; // Person receiving (driver or expert)
    oldLocation: string;
    newLocation: string;
    allocationDate: Date;
    items: VehicleAllocationItem[];
    status: VehicleAllocationStatus;
    
    // New detailed fields for delivery/return process
    processType: 'delivery' | 'return';
    deliveryType?: 'temporary' | 'permanent'; // Only for delivery
    mileage: number;
    isSigned: boolean;
    expertName: string;
    transactionTime?: string;      // For return time
    returnDuration?: string; // e.g., "5 days, 3 hours"
}


// --- Freight Management Interfaces ---

export interface Destination {
    id: string;
    city: string;
    representativeName: string;
    tonnage?: number;
    unloadTime?: string;
    brand?: 'میهن' | 'پاندا' | 'برنارد' | 'میلکوم' | 'پانلا' | 'آلینوس';
    freightCost?: number;
}

export interface AnnouncementHistory {
    timestamp: Date;
    userId: string;
    userName: string;
    action: string;
    fromStatus?: FreightAnnouncementStatus;
    toStatus?: FreightAnnouncementStatus;
    details?: string;
}

export interface FreightAnnouncement {
    id: string;
    announcementCode: string;
    createdAt: Date;
    loadingDate: Date; // New field for loading date
    lineType: FreightLineType;
    status: FreightAnnouncementStatus;
    paymentStatus?: FreightPaymentStatus;
    cargoValue: number; // In Rials
    vehicleType: string;
    notes?: string;
    rejectionReason?: string;
    
    // Assignment fields
    assignmentType?: 'company' | 'personal';
    assignedDriverId?: string;
    assignedVehicleId?: string;
    totalFreightCost?: number;
    billOfLadingNumber?: string;
    // DEPRECATED for personal, use assignedDriverId and look up Driver object
    assignedDriverName?: string;
    assignedDriverContact?: string;
    assignedVehiclePlate?: string;
    assignmentFinalizedAt?: string | Date; // زمان نهایی‌سازی تخصیص


    // Line-specific fields
    // Ice Cream (Line 1)
    originCity?: string;
    brand?: 'میهن' | 'پاندا' | 'برنارد' | 'میلکوم' | 'پانلا' | 'آلینوس';
    representativeType?: 'agent' | 'distributor';
    representativeName?: string;
    cartonCount?: number;
    priority?: 'low' | 'normal' | 'high';
    products?: string[]; // e.g., ['کره', 'کترینگ']
    
    // Dairy & Ambient (Lines 2 & 3)
    platformArrivalTime?: string;
    destinations: Destination[];

    // History
    history: AnnouncementHistory[];
}

export interface FreightTransaction {
    id: string;
    announcementId: string;
    amount: number;
    transactionDate: Date;
    notes?: string;
    isPaid: boolean;
    invoiceImage?: string; // file name
    receiptImage?: string; // file name
    extraDocumentImage?: string; // file name
}

export interface DispatchRouteSuggestion {
    id: string;
    province: string;
    city: string;
    roundTripKm: number | null;
    approvedAllowance: number | null;
    routeCategory?: string | null;
    distanceCategory?: string | null;
}

export type DispatchQueueType = 'near' | 'far' | 'workshop' | 'external' | 'leave' | 'other';

export interface DispatchQueueDriver {
    id: string;
    name: string;
    mobile?: string;
    employeeId?: string;
}

export interface DispatchQueueVehicle {
    id: string;
    model?: string;
    brand?: string;
    vehicleCode?: string;
    vehicleCategory?: string | null;
}

export interface DispatchQueueEntry {
    id: string;
    driverId: string;
    vehicleId: string;
    queueType: DispatchQueueType;
    vehicleCategory: string | null;
    position: number;
    notes?: string | null;
    createdAt: string;
    createdByUserId?: string | null;
    updatedAt?: string | null;
    updatedByUserId?: string | null;
    driver: DispatchQueueDriver;
    vehicle: DispatchQueueVehicle;
    longRouteHistory?: DispatchAssignmentHistory[];
    blockedStage1?: boolean;
}

export interface DispatchAssignmentHistory {
    id: string;
    created_at: string;
    stage: string;
    city?: string;
    route_category?: string;
    round_trip_km?: number;
    announcement_code?: string;
}

export interface DispatchAnnouncementCandidate {
    id: string;
    announcementCode?: string;
    lineType?: string;
    vehicleType?: string;
    originCity?: string;
    createdAt?: string;
    cargoValue?: number;
    totalFreightCost?: number;
    notes?: string | null;
    brand?: string | null;
    priority?: string | null;
    products?: string[];
    destination?: {
        id: string;
        city?: string;
        representativeName?: string;
        tonnage?: number;
        freightCost?: number;
    };
    route?: {
        id: string;
        city?: string;
        province?: string;
        route_category?: string;
        distance_category?: string;
        round_trip_km?: number;
    } | null;
}

export interface DispatchBoardEntry {
    assignmentId: string;
    stage: string;
    createdAt: string;
    announcementCode?: string;
    lineType?: string;
    vehicleType?: string;
    originCity?: string;
    driver?: DispatchQueueDriver;
    vehicle?: DispatchQueueVehicle;
    route?: {
        id: string;
        province?: string;
        routeCategory?: string;
        roundTripKm?: number;
        expectedDays?: number | null;
    } | null;
    daysSinceAssignment?: number;
}

export interface DispatchBoardCityColumn {
    city: string;
    entries: DispatchBoardEntry[];
}

export interface DispatchVehicleSearchResult extends DispatchQueueVehicle {
    plate?: {
        part1?: string | null;
        letter?: string | null;
        part2?: string | null;
        cityCode?: string | null;
    };
}

export interface DispatchDriverSearchResult extends DispatchQueueDriver {
    nationalCode?: string | null;
}

export interface DriverPreferenceAssignment {
    id: string;
    announcementId?: string;
    announcementCode?: string;
    stage: string;
    queueType?: 'far' | 'near' | 'workshop' | 'external' | 'leave' | 'other';
    lineType?: string | null;
    vehicleType?: string | null;
    originCity?: string | null;
    destinationCity?: string | null;
    routeCategory?: string | null;
    distanceCategory?: string | null;
    roundTripKm?: number | null;
    assignedAt: string;
    assignedAtJalali?: string | null;
    queuePosition?: number | null;
    isCancelled?: boolean;
}

export interface DriverPreferencePeerAssignment {
    id: string;
    driverId: string;
    driverName?: string | null;
    employeeId?: string | null;
    stage?: string | null;
    queuePosition?: number | null;
    queueType?: 'far' | 'near' | 'workshop' | 'external' | 'leave' | 'other';
    lineType?: string | null;
    destinationCity?: string | null;
    roundTripKm?: number | null;
    assignedAt: string;
    assignedAtJalali?: string | null;
    previousOriginCity?: string | null;
    announcementCode?: string | null;
    isCancelled?: boolean;
}

export interface DriverPreferenceOpportunity {
    id: string;
    announcementId?: string;
    announcementCode?: string;
    stage: string;
    lineType?: string | null;
    vehicleType?: string | null;
    originCity?: string | null;
    destinationCity?: string | null;
    routeCategory?: string | null;
    distanceCategory?: string | null;
    roundTripKm?: number | null;
    seenAt: string;
    seenAtJalali?: string | null;
    queuePosition?: number | null;
    others?: Array<{
        driverId: string;
        driverName?: string | null;
        queuePosition?: number | null;
        chosenAnnouncementCode?: string | null;
        lastOriginCity?: string | null;
    }>;
    sourceDriverId?: string | null;
    sourceDriverName?: string | null;
}

export interface DriverPreferencesResponse {
    driver: {
        id: string;
        name?: string | null;
        employeeId?: string | null;
        mobile?: string | null;
    };
    from: string;
    to: string;
    fromJalali: string;
    toJalali: string;
    taken: DriverPreferenceAssignment[];
    skipped: DriverPreferenceOpportunity[];
    peerAssignments?: DriverPreferencePeerAssignment[];
}

