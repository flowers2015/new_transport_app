const { randomUUID } = require('crypto');
const pool = require('../db');

const announcements = [
  {
    id: 'FA-DEMO-001',
    code: 'FA-DEMO-001',
    loadingDate: '2024-11-01',
    lineType: 'بستنی',
    status: 'PendingCompanyAssignment',
    cargoValue: 48000000,
    vehicleType: 'کامیون یخچالی',
    assignmentType: 'company',
    originCity: 'تهران',
    representativeType: 'پخش سراسری',
    representativeName: 'پخش تهران',
    notes: 'در انتظار تخصیص راننده شرکت.',
    platformArrivalTime: '08:30',
    brand: 'میهن',
    priority: 'High',
    products: [
      { name: 'بستنی لیوانی', cartons: 500 },
      { name: 'بستنی میوه‌ای', cartons: 320 },
    ],
    cartonCount: 820,
    totalFreightCost: 2150000,
    billOfLadingNumber: 'BL-DEMO-001',
    productLine: 'ice_cream',
    createdBy: 'USR101',
    createdByUserId: 'USR101',
    destinations: [
      {
        id: 'FD-DEMO-001',
        city: 'اصفهان',
        representativeName: 'نماینده اصفهان',
        tonnage: 12.5,
        freightCost: 950000,
      },
      {
        id: 'FD-DEMO-002',
        city: 'قم',
        representativeName: 'نماینده قم',
        tonnage: 6.2,
        freightCost: 480000,
      },
    ],
    history: [
      {
        id: 'FH-DEMO-001',
        userId: 'USR101',
        userName: 'کارمند برنامه‌ریزی',
        action: 'CREATED',
        description: 'اعلام بار توسط کارمند برنامه‌ریزی ثبت شد.',
        newStatus: 'PendingCompanyAssignment',
      },
    ],
    transactions: [
      {
        id: 'FT-DEMO-001',
        amount: 2150000,
        transactionDate: '2024-11-01',
        isPaid: false,
        notes: 'هزینه حمل برآوردی - در انتظار تایید',
      },
    ],
  },
  {
    id: 'FA-DEMO-002',
    code: 'FA-DEMO-002',
    loadingDate: '2024-11-03',
    lineType: 'پاستوریزه',
    status: 'Assigned',
    cargoValue: 36500000,
    vehicleType: 'کامیون سردخانه‌ای',
    assignmentType: 'company',
    assignedDriverId: 'DRV001',
    assignedVehicleId: 'VEH001',
    originCity: 'تهران',
    representativeType: 'فروش ویژه',
    representativeName: 'نماینده شمال',
    notes: 'راننده شرکت برای حمل به شمال تعیین شد.',
    platformArrivalTime: '07:45',
    brand: 'میهن',
    priority: 'Normal',
    products: [
      { name: 'شیر یک لیتری', cartons: 600 },
      { name: 'پنیر پاستوریزه', cartons: 180 },
    ],
    cartonCount: 780,
    totalFreightCost: 1780000,
    billOfLadingNumber: 'BL-DEMO-002',
    productLine: 'story',
    createdBy: 'USR101',
    createdByUserId: 'USR101',
    destinations: [
      {
        id: 'FD-DEMO-003',
        city: 'رشت',
        representativeName: 'نماینده رشت',
        tonnage: 10.4,
        freightCost: 720000,
      },
      {
        id: 'FD-DEMO-004',
        city: 'ساری',
        representativeName: 'نماینده ساری',
        tonnage: 8.9,
        freightCost: 620000,
      },
    ],
    history: [
      {
        id: 'FH-DEMO-002',
        userId: 'USR101',
        userName: 'کارمند برنامه‌ریزی',
        action: 'CREATED',
        description: 'اعلام بار ثبت شد.',
        newStatus: 'PendingCompanyAssignment',
      },
      {
        id: 'FH-DEMO-003',
        userId: 'USR102',
        userName: 'مدیر برنامه‌ریزی',
        action: 'ASSIGNED',
        oldStatus: 'PendingCompanyAssignment',
        newStatus: 'Assigned',
        description: 'راننده و خودرو شرکت تخصیص داده شد.',
      },
    ],
    transactions: [
      {
        id: 'FT-DEMO-002',
        amount: 1780000,
        transactionDate: '2024-11-04',
        isPaid: true,
        notes: 'هزینه حمل شرکت - پرداخت شده',
      },
    ],
  },
  {
    id: 'FA-DEMO-003',
    code: 'FA-DEMO-003',
    loadingDate: '2024-11-05',
    lineType: 'لبنیات-فروتلند',
    status: 'InTransit',
    cargoValue: 40200000,
    vehicleType: 'تریلر یخچالی',
    assignmentType: 'personal',
    assignedDriverId: 'a18cac7e-0eeb-4c1a-9e8e-5da4b8eccbf5',
    assignedVehicleId: 'VEH002',
    originCity: 'کرج',
    representativeType: 'فروش فروشگاهی',
    representativeName: 'پخش غرب',
    notes: 'بار توسط راننده شخصی در مسیر است.',
    platformArrivalTime: '06:30',
    brand: 'میهن',
    priority: 'High',
    products: [
      { name: 'ماست دبه‌ای', cartons: 540 },
      { name: 'دوغ بطری', cartons: 450 },
    ],
    cartonCount: 990,
    totalFreightCost: 2350000,
    billOfLadingNumber: 'BL-DEMO-003',
    productLine: 'dairy_fertiland',
    createdBy: 'USR101',
    createdByUserId: 'USR101',
    destinations: [
      {
        id: 'FD-DEMO-005',
        city: 'همدان',
        representativeName: 'نماینده همدان',
        tonnage: 11.7,
        freightCost: 830000,
      },
      {
        id: 'FD-DEMO-006',
        city: 'کرمانشاه',
        representativeName: 'نماینده کرمانشاه',
        tonnage: 13.2,
        freightCost: 970000,
      },
    ],
    history: [
      {
        id: 'FH-DEMO-004',
        userId: 'USR101',
        userName: 'کارمند برنامه‌ریزی',
        action: 'CREATED',
        description: 'اعلام بار ایجاد شد.',
        newStatus: 'PendingPersonalAssignment',
      },
      {
        id: 'FH-DEMO-005',
        userId: 'USR102',
        userName: 'مدیر برنامه‌ریزی',
        action: 'ASSIGNED',
        oldStatus: 'PendingPersonalAssignment',
        newStatus: 'InTransit',
        description: 'راننده شخصی تایید و وارد مسیر شد.',
      },
    ],
    transactions: [
      {
        id: 'FT-DEMO-003',
        amount: 2350000,
        transactionDate: '2024-11-05',
        isPaid: false,
        notes: 'هزینه حمل راننده شخصی - در انتظار تسویه',
      },
    ],
  },
];

async function seedFreightDemo() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const announcement of announcements) {
      const announcementId = announcement.id || randomUUID();

      await client.query(
        'DELETE FROM freight_announcement_history WHERE freight_announcement_id = $1',
        [announcementId],
      );
      await client.query(
        'DELETE FROM freight_destinations WHERE freight_announcement_id = $1',
        [announcementId],
      );
      await client.query(
        'DELETE FROM freight_transactions WHERE announcement_id = $1',
        [announcementId],
      );
      await client.query(
        'DELETE FROM freight_announcements WHERE id = $1 OR announcement_code = $2',
        [announcementId, announcement.code],
      );

      const {
        rows: [inserted],
      } = await client.query(
        `
          INSERT INTO freight_announcements (
            id,
            announcement_code,
            loading_date,
            line_type,
            status,
            cargo_value,
            vehicle_type,
            assignment_type,
            assigned_driver_id,
            assigned_vehicle_id,
            total_freight_cost,
            carton_count,
            notes,
            origin_city,
            representative_type,
            representative_name,
            platform_arrival_time,
            brand,
            priority,
            products,
            rejection_reason,
            bill_of_lading_number,
            created_by,
            product_line,
            created_by_user_id,
            dispatch_stage,
            created_at,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
          )
          RETURNING id
        `,
        [
          announcementId,
          announcement.code,
          announcement.loadingDate,
          announcement.lineType,
          announcement.status,
          announcement.cargoValue,
          announcement.vehicleType,
          announcement.assignmentType,
          announcement.assignedDriverId || null,
          announcement.assignedVehicleId || null,
          announcement.totalFreightCost || null,
          announcement.cartonCount || null,
          announcement.notes || null,
          announcement.originCity || null,
          announcement.representativeType || null,
          announcement.representativeName || null,
          announcement.platformArrivalTime || null,
          announcement.brand || null,
          announcement.priority || null,
          announcement.products ? JSON.stringify(announcement.products) : null,
          announcement.rejectionReason || null,
          announcement.billOfLadingNumber || null,
          announcement.createdBy || null,
          announcement.productLine || null,
          announcement.createdByUserId || null,
          announcement.dispatchStage || null,
          announcement.createdAt || new Date(),
          announcement.updatedAt || new Date(),
        ],
      );

      const newAnnouncementId = inserted.id;

      for (const destination of announcement.destinations || []) {
        await client.query(
          `
            INSERT INTO freight_destinations (
              id,
              freight_announcement_id,
              city,
              representative_name,
              tonnage,
              freight_cost,
              unload_time,
              created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            destination.id || randomUUID(),
            newAnnouncementId,
            destination.city,
            destination.representativeName || null,
            destination.tonnage || null,
            destination.freightCost || null,
            destination.unloadTime || null,
            destination.createdAt || new Date(),
          ],
        );
      }

      for (const history of announcement.history || []) {
        await client.query(
          `
            INSERT INTO freight_announcement_history (
              id,
              freight_announcement_id,
              user_id,
              user_name,
              action,
              old_status,
              new_status,
              field_changes,
              description,
              ip_address,
              created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            history.id || randomUUID(),
            newAnnouncementId,
            history.userId || null,
            history.userName || 'کاربر سیستم',
            history.action,
            history.oldStatus || null,
            history.newStatus || null,
            history.fieldChanges ? JSON.stringify(history.fieldChanges) : null,
            history.description || '',
            history.ipAddress || null,
            history.createdAt || new Date(),
          ],
        );
      }

      for (const transaction of announcement.transactions || []) {
        await client.query(
          `
            INSERT INTO freight_transactions (
              id,
              announcement_id,
              amount,
              transaction_date,
              is_paid,
              notes,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            transaction.id || randomUUID(),
            newAnnouncementId,
            transaction.amount,
            transaction.transactionDate,
            transaction.isPaid ?? null,
            transaction.notes || null,
            transaction.createdAt || new Date(),
            transaction.updatedAt || new Date(),
          ],
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Freight demo data seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed freight demo data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedFreightDemo()
    .then(() => {
      if (!process.exitCode) {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = seedFreightDemo;

