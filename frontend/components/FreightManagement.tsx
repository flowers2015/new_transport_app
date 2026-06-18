import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FreightAnnouncement, FreightLineType, FreightAnnouncementStatus, User, Destination } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalaliDateTime, formatJalali } from '../utils/jalali';
import { formatNumberWhileTyping, parseNumberFromFormatted, formatNumberWithSeparator } from '../utils/numberFormatter';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface FreightManagementProps {
  currentUser: User;
}

interface AdminAction {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: 'create' | 'update' | 'delete';
  tableName: string;
  recordId: string;
  oldValue: any;
  newValue: any;
  reason: string;
  createdAt: string;
}

const FreightManagement: React.FC<FreightManagementProps> = ({ currentUser }) => {
  const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lineTypeFilter, setLineTypeFilter] = useState('');
  const [lastEditedAnnouncementId, setLastEditedAnnouncementId] = useState<string | null>(null); // برای پیدا کردن صفحه بعد از ویرایش
  const itemsPerPage = 30; // تعداد ردیف‌ها در هر صفحه
  
  // Debug: لاگ تغییرات announcements
  useEffect(() => {
    console.log('📊 [FreightManagement] announcements state تغییر کرد:', {
      count: announcements.length,
      firstItem: announcements[0] ? {
        id: announcements[0].id,
        code: announcements[0].announcementCode,
        status: announcements[0].status,
        loadingDate: announcements[0].loadingDate,
        totalFreightCost: announcements[0].totalFreightCost
      } : null,
      secondItem: announcements[1] ? {
        id: announcements[1].id,
        code: announcements[1].announcementCode,
        status: announcements[1].status,
        loadingDate: announcements[1].loadingDate,
        totalFreightCost: announcements[1].totalFreightCost
      } : null,
      lastItem: announcements[announcements.length - 1] ? {
        id: announcements[announcements.length - 1].id,
        code: announcements[announcements.length - 1].announcementCode
      } : null,
      timestamp: new Date().toISOString()
    });
  }, [announcements]);

  // پیدا کردن صفحه ردیف ویرایش شده بعد از به‌روزرسانی announcements
  useEffect(() => {
    console.log('🔍 [FreightManagement] useEffect برای پیدا کردن صفحه - بررسی:', {
      lastEditedAnnouncementId,
      announcementsLength: announcements.length,
      hasLastEditedId: !!lastEditedAnnouncementId
    });
    
    if (lastEditedAnnouncementId && announcements.length > 0) {
      // فیلتر و مرتب‌سازی مشابه filteredAnnouncements
      const filtered = announcements.filter(ann => {
        const matchesSearch = !searchTerm || 
          ann.announcementCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ann.billOfLadingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ann.destinations?.some(d => d.city?.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesStatus = !statusFilter || ann.status === statusFilter;
        const matchesLineType = !lineTypeFilter || ann.lineType === lineTypeFilter;
        
        return matchesSearch && matchesStatus && matchesLineType;
      });
      
      const sorted = [...filtered].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      const editedIndex = sorted.findIndex(ann => ann.id === lastEditedAnnouncementId);
      
      console.log('🔍 [FreightManagement] جستجوی ردیف ویرایش شده:', {
        lastEditedAnnouncementId,
        sortedLength: sorted.length,
        editedIndex,
        firstFewIds: sorted.slice(0, 5).map(a => ({ id: a.id, code: a.announcementCode, createdAt: a.createdAt })),
        editedItemInSorted: sorted.find(ann => ann.id === lastEditedAnnouncementId) ? {
          id: sorted.find(ann => ann.id === lastEditedAnnouncementId)?.id,
          code: sorted.find(ann => ann.id === lastEditedAnnouncementId)?.announcementCode,
          createdAt: sorted.find(ann => ann.id === lastEditedAnnouncementId)?.createdAt
        } : null
      });
      
      if (editedIndex !== -1) {
        // محاسبه صفحه‌ای که ردیف ویرایش شده در آن است
        const targetPage = Math.floor(editedIndex / itemsPerPage) + 1;
        const currentPageValue = currentPageRef.current;
        console.log('📍 [FreightManagement] پیدا کردن صفحه ردیف ویرایش شده:', {
          editedIndex,
          targetPage,
          itemsPerPage,
          editedAnnouncementId: lastEditedAnnouncementId,
          totalFiltered: sorted.length,
          currentPage: currentPageValue,
          willChangePage: targetPage !== currentPageValue,
          itemsInTargetPage: sorted.slice((targetPage - 1) * itemsPerPage, targetPage * itemsPerPage).map(a => a.id)
        });
        
        if (targetPage !== currentPageValue) {
          console.log('🔄 [FreightManagement] تغییر صفحه از', currentPageValue, 'به', targetPage);
          setCurrentPage(targetPage);
        } else {
          console.log('ℹ️ [FreightManagement] ردیف ویرایش شده در همان صفحه است:', targetPage);
          // حتی اگر در همان صفحه است، force re-render برای اطمینان از نمایش صحیح
          // با استفاده از setTimeout برای اطمینان از اینکه DOM به‌روز شده است
          setTimeout(() => {
            const rowElement = document.querySelector(`[data-announcement-id="${lastEditedAnnouncementId}"]`);
            if (rowElement) {
              rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              console.log('✅ [FreightManagement] اسکرول به ردیف ویرایش شده انجام شد');
            } else {
              console.log('⚠️ [FreightManagement] ردیف ویرایش شده در DOM پیدا نشد');
            }
          }, 100);
        }
      } else {
        console.log('⚠️ [FreightManagement] ردیف ویرایش شده پیدا نشد:', {
          editedAnnouncementId: lastEditedAnnouncementId,
          totalFiltered: sorted.length,
          firstFewIds: sorted.slice(0, 5).map(a => a.id)
        });
      }
      
      // پاک کردن lastEditedAnnouncementId بعد از استفاده
      setLastEditedAnnouncementId(null);
    }
  }, [lastEditedAnnouncementId, announcements, searchTerm, statusFilter, lineTypeFilter, itemsPerPage]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<FreightAnnouncement | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [history, setHistory] = useState<AdminAction[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [tableKey, setTableKey] = useState(0); // برای force re-render جدول
  const [refreshTrigger, setRefreshTrigger] = useState(0); // برای force re-render کامل
  
  // به‌روزرسانی ref هر زمان که currentPage تغییر می‌کند
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Form states
  const [formData, setFormData] = useState<any>({});
  // State برای نگه‌داری مقدار خام فیلدهای عددی (قبل از فرمت)
  const [rawNumericValues, setRawNumericValues] = useState<{
    cargoValue?: string;
    totalFreightCost?: string;
    destinations?: { [index: number]: { tonnage?: string; freightCost?: string } };
  }>({});

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
  });

  // دریافت لیست اعلام بارها
  const fetchAnnouncements = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      // اضافه کردن timestamp برای جلوگیری از cache
      const timestamp = new Date().getTime();
      const headers = getHeaders();
      const res = await fetch(
        `${getApiUrl('freight-announcements?includeFinalized=true&includeLeftover=true')}&_t=${timestamp}`,
        { 
          headers,
          cache: 'no-cache'
        }
      );
      if (!res.ok) throw new Error('خطا در دریافت لیست اعلام بارها');
      const raw = await res.json();
      
      // Normalize داده‌ها (مثل FreightPlanningContainer)
      const statusMap: Record<string, FreightAnnouncementStatus> = {
        'Draft': FreightAnnouncementStatus.Draft,
        'PendingManagerApproval': FreightAnnouncementStatus.PendingManagerApproval,
        'Rejected': FreightAnnouncementStatus.Rejected,
        'PendingPersonalAssignment': FreightAnnouncementStatus.PendingPersonalAssignment,
        'PendingCompanyAssignment': FreightAnnouncementStatus.PendingCompanyAssignment,
        'Assigned': FreightAnnouncementStatus.Assigned,
        'InTransit': FreightAnnouncementStatus.InTransit,
        'Finalized': FreightAnnouncementStatus.Finalized,
        'Cancelled': FreightAnnouncementStatus.Cancelled,
        'ReAnnounced': FreightAnnouncementStatus.ReAnnounced,
        'Leftover': FreightAnnouncementStatus.Leftover,
        'ChangeRequested': FreightAnnouncementStatus.ChangeRequested,
        'Archived': FreightAnnouncementStatus.Archived,
      };

      const normalize = (a: any): FreightAnnouncement => {
        // تبدیل loading_date
        let loadingDate: any = a.loading_date || a.loadingDate;
        if (typeof loadingDate === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(loadingDate)) {
          loadingDate = loadingDate.replace(/-/g, '/');
        } else if (loadingDate instanceof Date) {
          loadingDate = formatJalali(loadingDate);
        }

        return {
          id: a.id,
          announcementCode: a.announcement_code || a.announcementCode || '-',
          createdAt: new Date(a.created_at || a.createdAt || Date.now()),
          loadingDate: loadingDate,
          lineType: (a.line_type || a.lineType) as FreightLineType,
          status: statusMap[a.status] || a.status,
          cargoValue: Number(a.cargo_value ?? a.cargoValue ?? 0),
          vehicleType: a.vehicle_type || a.vehicleType || '',
          notes: a.notes,
          rejectionReason: a.rejection_reason,
          assignedDriverId: a.assigned_driver_id || a.assignedDriverId,
          assignedVehicleId: a.assigned_vehicle_id || a.assignedVehicleId,
          totalFreightCost: a.total_freight_cost || a.totalFreightCost || 0,
          billOfLadingNumber: a.bill_of_lading_number || a.billOfLadingNumber,
          assignedDriverName: a.assigned_driver_name || a.assignedDriverName,
          assignedDriverEmployeeId: a.assigned_driver_employee_id || a.assignedDriverEmployeeId,
          assignedVehicleModel: a.assigned_vehicle_model || a.assignedVehicleModel,
          assignedVehicleBrand: a.assigned_vehicle_brand || a.assignedVehicleBrand,
          vehiclePlate: a.plate_part1 && a.plate_letter && a.plate_part2 && a.plate_city_code 
            ? `${a.plate_part1}${a.plate_letter}${a.plate_part2}-${a.plate_city_code}`
            : (a.vehicle_plate || ''),
          assignmentType: a.assignment_type || a.assignmentType,
          originCity: a.origin_city,
          brand: a.brand,
          representativeType: a.representative_type,
          representativeName: a.representative_name,
          cartonCount: a.carton_count,
          priority: a.priority,
          products: a.products ? (Array.isArray(a.products) ? a.products : JSON.parse(a.products)) : [],
          platformArrivalTime: a.platform_arrival_time,
          destinations: (a.destinations || []).map((d: any) => ({
            id: d.id,
            city: d.city || '',
            representativeName: d.representative_name || '',
            tonnage: d.tonnage ? Number(d.tonnage) : 0,
            freightCost: d.freight_cost ? Number(d.freight_cost) : 0,
            unloadTime: d.unload_time || ''
          })),
          createdBy: a.created_by || a.createdBy || a.user_id,
          createdByName: a.created_by_name || a.createdByName || a.user_name || a.created_by_user_name
        } as any;
      };

      const normalized = raw.map(normalize);
      
      // مقایسه با state قبلی
      const previousState = announcements;
      // لاگ دقیق برای ردیف دوم
      const secondItemNewStr = normalized[1] ? JSON.stringify({
        id: normalized[1].id,
        code: normalized[1].announcementCode,
        loadingDate: normalized[1].loadingDate,
        totalFreightCost: normalized[1].totalFreightCost,
        destinations: normalized[1].destinations,
        originCity: normalized[1].originCity,
        brand: normalized[1].brand
      }, null, 2) : 'null';
      const secondItemOldStr = previousState[1] ? JSON.stringify({
        id: previousState[1].id,
        code: previousState[1].announcementCode,
        loadingDate: previousState[1].loadingDate,
        totalFreightCost: previousState[1].totalFreightCost,
        destinations: previousState[1].destinations,
        originCity: previousState[1].originCity,
        brand: previousState[1].brand
      }, null, 2) : 'null';
      
      console.log('🔍 [FreightManagement] قبل از setAnnouncements - مقایسه:', {
        rawCount: raw.length,
        normalizedCount: normalized.length,
        previousCount: previousState.length,
        firstItemNew: normalized[0] ? {
          id: normalized[0].id,
          code: normalized[0].announcementCode,
          status: normalized[0].status,
          loadingDate: normalized[0].loadingDate,
          totalFreightCost: normalized[0].totalFreightCost
        } : null,
        firstItemOld: previousState[0] ? {
          id: previousState[0].id,
          code: previousState[0].announcementCode,
          status: previousState[0].status,
          loadingDate: previousState[0].loadingDate,
          totalFreightCost: previousState[0].totalFreightCost
        } : null,
        secondItemNew: normalized[1] ? {
          id: normalized[1].id,
          code: normalized[1].announcementCode,
          status: normalized[1].status,
          loadingDate: normalized[1].loadingDate,
          totalFreightCost: normalized[1].totalFreightCost,
          destinations: normalized[1].destinations?.map(d => ({ city: d.city, tonnage: d.tonnage, freightCost: d.freightCost })),
          originCity: normalized[1].originCity,
          brand: normalized[1].brand,
          assignedDriverName: normalized[1].assignedDriverName,
          billOfLadingNumber: normalized[1].billOfLadingNumber
        } : null,
        secondItemOld: previousState[1] ? {
          id: previousState[1].id,
          code: previousState[1].announcementCode,
          status: previousState[1].status,
          loadingDate: previousState[1].loadingDate,
          totalFreightCost: previousState[1].totalFreightCost,
          destinations: previousState[1].destinations?.map(d => ({ city: d.city, tonnage: d.tonnage, freightCost: d.freightCost })),
          originCity: previousState[1].originCity,
          brand: previousState[1].brand,
          assignedDriverName: previousState[1].assignedDriverName,
          billOfLadingNumber: previousState[1].billOfLadingNumber
        } : null,
        isEqual: JSON.stringify(normalized) === JSON.stringify(previousState),
        // بررسی تغییرات در ردیف دوم
        secondItemChanged: normalized[1] && previousState[1] ? {
          idChanged: normalized[1].id !== previousState[1].id,
          codeChanged: normalized[1].announcementCode !== previousState[1].announcementCode,
          loadingDateChanged: normalized[1].loadingDate !== previousState[1].loadingDate,
          totalFreightCostChanged: normalized[1].totalFreightCost !== previousState[1].totalFreightCost,
          destinationsChanged: JSON.stringify(normalized[1].destinations) !== JSON.stringify(previousState[1].destinations)
        } : null,
        timestamp: new Date().toISOString()
      });
      
      // لاگ دقیق برای مقایسه ردیف دوم
      console.log('🔍 [FreightManagement] مقایسه دقیق ردیف دوم:');
      console.log('📦 ردیف دوم جدید:', secondItemNewStr);
      console.log('📦 ردیف دوم قدیم:', secondItemOldStr);
      console.log('🔄 آیا تغییر کرده؟', secondItemNewStr !== secondItemOldStr);
      
      // Force update با استفاده از deep copy برای اطمینان از تغییر reference
      const deepCopy = JSON.parse(JSON.stringify(normalized));
      
      console.log('🔄 [FreightManagement] در حال setAnnouncements:', {
        deepCopyCount: deepCopy.length,
        deepCopyFirstItem: deepCopy[0] ? {
          id: deepCopy[0].id,
          code: deepCopy[0].announcementCode,
          loadingDate: deepCopy[0].loadingDate
        } : null,
        deepCopySecondItem: deepCopy[1] ? {
          id: deepCopy[1].id,
          code: deepCopy[1].announcementCode,
          loadingDate: deepCopy[1].loadingDate,
          totalFreightCost: deepCopy[1].totalFreightCost,
          destinations: deepCopy[1].destinations?.map(d => ({ city: d.city, tonnage: d.tonnage, freightCost: d.freightCost })),
          originCity: deepCopy[1].originCity,
          brand: deepCopy[1].brand
        } : null,
        timestamp: new Date().toISOString()
      });
      
      // به‌روزرسانی state - استفاده از functional update برای force re-render
      setAnnouncements(prev => {
        const newState = [...deepCopy];
        console.log('✅ [FreightManagement] setAnnouncements callback:', {
          prevCount: prev.length,
          newCount: newState.length,
          prevSecondItem: prev[1] ? {
            id: prev[1].id,
            code: prev[1].announcementCode,
            loadingDate: prev[1].loadingDate
          } : null,
          newSecondItem: newState[1] ? {
            id: newState[1].id,
            code: newState[1].announcementCode,
            loadingDate: newState[1].loadingDate
          } : null,
          isEqual: JSON.stringify(prev) === JSON.stringify(newState),
          timestamp: new Date().toISOString()
        });
        return newState;
      });
      // Force re-render جدول با تغییر tableKey و refreshTrigger
      const newTableKey = tableKey + 1;
      const newRefreshTrigger = refreshTrigger + 1;
      setTableKey(newTableKey);
      setRefreshTrigger(newRefreshTrigger);
      console.log('✅ [FreightManagement] setAnnouncements فراخوانی شد:', {
        count: deepCopy.length,
        newTableKey,
        newRefreshTrigger,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('❌ [FreightManagement] خطا در دریافت اعلام بارها:', err);
      if (!silent) {
        setError(err.message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // دریافت لاگ تغییرات یک اعلام بار
  const fetchHistory = async (announcementId: string) => {
    try {
      const url = getApiUrl(`admin/admin-actions?tableName=freight_announcements&recordId=${announcementId}&page=1&limit=50`);
      console.log('🔍 [FreightManagement] در حال دریافت تاریخچه:', {
        announcementId,
        url,
        tableName: 'freight_announcements'
      });
      
      const res = await fetch(url, { headers: getHeaders(), cache: 'no-cache' });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ [FreightManagement] خطا در دریافت لاگ:', {
          status: res.status,
          statusText: res.statusText,
          errorText
        });
        throw new Error(`خطا در دریافت لاگ تغییرات: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      console.log('📋 [FreightManagement] پاسخ API تاریخچه:', {
        total: data.total,
        page: data.page,
        limit: data.limit,
        actionsCount: data.actions?.length || 0,
        firstAction: data.actions?.[0],
        allActions: data.actions,
        dataKeys: Object.keys(data),
        dataStructure: JSON.stringify(data, null, 2)
      });
      const actionsToSet = data.actions || [];
      console.log('🔄 [FreightManagement] تنظیم history state:', {
        actionsCount: actionsToSet.length,
        actions: actionsToSet
      });
      setHistory(actionsToSet);
    } catch (err: any) {
      console.error('❌ [FreightManagement] خطا در دریافت لاگ:', err);
      setHistory([]);
    }
  };

  // بارگذاری اولیه
  useEffect(() => {
    fetchAnnouncements();
  }, []); // فقط یک بار در mount

  // Auto-refresh هر 30 ثانیه (بدون immediate تا از refresh مداوم جلوگیری شود)
  useAutoRefresh({
    refreshFn: () => fetchAnnouncements(true), // silent refresh
    interval: 30000, // 30 ثانیه
    onlyWhenVisible: true,
    immediate: false, // غیرفعال کردن immediate برای جلوگیری از refresh مداوم
    enabled: true,
    silent: true, // silent mode برای جلوگیری از چشمک زدن
  });

  // لاگ تغییرات history state
  useEffect(() => {
    console.log('📊 [FreightManagement] history state تغییر کرد:', {
      historyLength: history.length,
      history: history,
      showHistoryDialog,
      selectedAnnouncementId: selectedAnnouncement?.id,
      selectedAnnouncementCode: selectedAnnouncement?.announcementCode
    });
  }, [history, showHistoryDialog, selectedAnnouncement]);

  // فیلتر و مرتب‌سازی اعلام بارها (جدیدترین اول)
  const filteredAnnouncements = useMemo(() => {
    console.log('🔄 [FreightManagement] محاسبه filteredAnnouncements:', {
      announcementsCount: announcements.length,
      searchTerm,
      statusFilter,
      lineTypeFilter,
      refreshTrigger,
      firstItem: announcements[0] ? {
        id: announcements[0].id,
        code: announcements[0].announcementCode,
        loadingDate: announcements[0].loadingDate
      } : null,
      secondItem: announcements[1] ? {
        id: announcements[1].id,
        code: announcements[1].announcementCode,
        loadingDate: announcements[1].loadingDate
      } : null,
      timestamp: new Date().toISOString()
    });
    
    // ایجاد کپی برای جلوگیری از mutation
    const announcementsCopy = [...announcements];
    
    const filtered = announcementsCopy.filter(ann => {
      const matchesSearch = !searchTerm || 
        ann.announcementCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ann.billOfLadingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ann.destinations?.some(d => d.city?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = !statusFilter || ann.status === statusFilter;
      const matchesLineType = !lineTypeFilter || ann.lineType === lineTypeFilter;
      
      return matchesSearch && matchesStatus && matchesLineType;
    });
    
    console.log('🔍 [FreightManagement] بعد از فیلتر:', {
      filteredCount: filtered.length,
      firstItem: filtered[0] ? {
        id: filtered[0].id,
        code: filtered[0].announcementCode,
        status: filtered[0].status,
        loadingDate: filtered[0].loadingDate,
        totalFreightCost: filtered[0].totalFreightCost
      } : null,
      secondItem: filtered[1] ? {
        id: filtered[1].id,
        code: filtered[1].announcementCode,
        status: filtered[1].status,
        loadingDate: filtered[1].loadingDate,
        totalFreightCost: filtered[1].totalFreightCost
      } : null,
      timestamp: new Date().toISOString()
    });
    
    // مرتب‌سازی بر اساس تاریخ ایجاد (جدیدترین اول) - ایجاد کپی جدید برای sort
    const sorted = [...filtered].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // نزولی (جدیدترین اول)
    });
    
    console.log('✅ [FreightManagement] بعد از مرتب‌سازی:', {
      sortedCount: sorted.length,
      firstItem: sorted[0] ? {
        id: sorted[0].id,
        code: sorted[0].announcementCode,
        createdAt: sorted[0].createdAt,
        loadingDate: sorted[0].loadingDate,
        totalFreightCost: sorted[0].totalFreightCost
      } : null,
      secondItem: sorted[1] ? {
        id: sorted[1].id,
        code: sorted[1].announcementCode,
        createdAt: sorted[1].createdAt,
        loadingDate: sorted[1].loadingDate,
        totalFreightCost: sorted[1].totalFreightCost
      } : null,
      timestamp: new Date().toISOString()
    });
    
    return sorted;
  }, [announcements, searchTerm, statusFilter, lineTypeFilter, refreshTrigger]);

  // محاسبه صفحه‌بندی
  const totalPages = Math.ceil(filteredAnnouncements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAnnouncements = useMemo(() => {
    const result = filteredAnnouncements.slice(startIndex, endIndex);
    console.log('📄 [FreightManagement] صفحه‌بندی:', {
      totalPages,
      currentPage,
      startIndex,
      endIndex,
      filteredCount: filteredAnnouncements.length,
      paginatedCount: result.length,
      firstPaginatedItem: result[0] ? {
        id: result[0].id,
        code: result[0].announcementCode,
        loadingDate: result[0].loadingDate,
        totalFreightCost: result[0].totalFreightCost
      } : null,
      secondPaginatedItem: result[1] ? {
        id: result[1].id,
        code: result[1].announcementCode,
        loadingDate: result[1].loadingDate,
        totalFreightCost: result[1].totalFreightCost
      } : null,
      tableKey,
      refreshTrigger,
      timestamp: new Date().toISOString()
    });
    return result;
  }, [filteredAnnouncements, startIndex, endIndex, totalPages, currentPage, tableKey, refreshTrigger]);

  // وقتی فیلتر تغییر می‌کند، به صفحه اول برگرد
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, lineTypeFilter]);

  // باز کردن دیالوگ ویرایش
  const openEditDialog = (announcement: FreightAnnouncement) => {
    setSelectedAnnouncement(announcement);
    
    // تبدیل loadingDate به string
    let loadingDateStr = '';
    if (announcement.loadingDate) {
      if (typeof announcement.loadingDate === 'string') {
        loadingDateStr = announcement.loadingDate;
      } else {
        loadingDateStr = formatJalali(announcement.loadingDate);
      }
    }
    
    setFormData({
      loadingDate: loadingDateStr,
      lineType: announcement.lineType,
      cargoValue: Number(announcement.cargoValue) || 0,
      vehicleType: announcement.vehicleType || '',
      originCity: announcement.originCity || '',
      brand: announcement.brand || '',
      representativeType: announcement.representativeType,
      representativeName: announcement.representativeName || '',
      cartonCount: announcement.cartonCount,
      priority: announcement.priority,
      products: announcement.products || [],
      platformArrivalTime: announcement.platformArrivalTime || '',
      destinations: announcement.destinations ? announcement.destinations.map((d: any) => ({
        ...d,
        tonnage: d.tonnage ? Number(d.tonnage) : 0,
        freightCost: d.freightCost ? Number(d.freightCost) : 0
      })) : [],
      notes: announcement.notes || '',
      // فیلدهای تخصیص
      assignedDriverId: announcement.assignedDriverId || '',
      assignedDriverName: announcement.assignedDriverName || (announcement as any).assignedDriverName || '',
      assignedDriverEmployeeId: (announcement as any).assignedDriverEmployeeId || '',
      assignedVehicleId: announcement.assignedVehicleId || '',
      assignedVehicleModel: (announcement as any).assignedVehicleModel || '',
      assignedVehicleBrand: (announcement as any).assignedVehicleBrand || '',
      vehiclePlate: (announcement as any).vehiclePlate || '',
      totalFreightCost: Number(announcement.totalFreightCost) || 0,
      billOfLadingNumber: announcement.billOfLadingNumber || '',
      assignmentType: announcement.assignmentType || ''
    });
    // مقداردهی اولیه raw values
    setRawNumericValues({
      cargoValue: String(announcement.cargoValue || ''),
      totalFreightCost: String(announcement.totalFreightCost || ''),
      destinations: announcement.destinations ? announcement.destinations.reduce((acc: any, d: any, idx: number) => {
        acc[idx] = {
          tonnage: String(d.tonnage || ''),
          freightCost: String(d.freightCost || '')
        };
        return acc;
      }, {}) : {}
    });
    setShowEditDialog(true);
  };

  // باز کردن دیالوگ حذف
  const openDeleteDialog = (announcement: FreightAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setDeleteTargetIds([announcement.id]);
    setShowDeleteDialog(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedIds.length === 0) return;
    setSelectedAnnouncement(null);
    setDeleteTargetIds([...selectedIds]);
    setShowDeleteDialog(true);
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  const currentPageIds = useMemo(
    () => paginatedAnnouncements.map((ann) => ann.id),
    [paginatedAnnouncements]
  );

  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllCurrentPage = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...currentPageIds])]);
  };

  // باز کردن دیالوگ تاریخچه
  const openHistoryDialog = async (announcement: FreightAnnouncement) => {
    console.log('📋 [FreightManagement] باز کردن دیالوگ تاریخچه:', {
      announcementId: announcement.id,
      announcementCode: announcement.announcementCode,
      announcement: announcement
    });
    setSelectedAnnouncement(announcement);
    await fetchHistory(announcement.id);
    setShowHistoryDialog(true);
  };

  // ویرایش اعلام بار
  const handleUpdate = async () => {
    try {
      if (!editReason) {
        alert('لطفاً دلیل تغییر را وارد کنید');
        return;
      }

      if (!selectedAnnouncement) return;

      // اطمینان از اینکه اعداد بدون جداکننده ارسال شوند
      const updateData = {
        ...formData,
        cargoValue: typeof formData.cargoValue === 'number' ? formData.cargoValue : parseNumberFromFormatted(String(formData.cargoValue)),
        totalFreightCost: typeof formData.totalFreightCost === 'number' ? formData.totalFreightCost : parseNumberFromFormatted(String(formData.totalFreightCost)),
        destinations: formData.destinations.map((d: any) => ({
          ...d,
          tonnage: typeof d.tonnage === 'number' ? d.tonnage : parseNumberFromFormatted(String(d.tonnage || 0)),
          freightCost: typeof d.freightCost === 'number' ? d.freightCost : parseNumberFromFormatted(String(d.freightCost || 0))
        })),
        reason: editReason
      };

      const res = await fetch(getApiUrl(`freight-announcements/${selectedAnnouncement.id}`), {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updateData),
        cache: 'no-cache'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'خطا در به‌روزرسانی اعلام بار');
      }

      const editedAnnouncementId = selectedAnnouncement?.id;
      
      alert('اعلام بار با موفقیت به‌روزرسانی شد');
      setShowEditDialog(false);
      setEditReason('');
      setSelectedAnnouncement(null);
      
      console.log('🔄 [FreightManagement] قبل از fetchAnnouncements در handleUpdate:', {
        currentAnnouncementsCount: announcements.length,
        selectedAnnouncementId: editedAnnouncementId,
        timestamp: new Date().toISOString()
      });
      
      // ذخیره ID ردیف ویرایش شده برای پیدا کردن صفحه بعد از fetch
      if (editedAnnouncementId) {
        setLastEditedAnnouncementId(editedAnnouncementId);
      }
      
      // به‌روزرسانی لیست
      await fetchAnnouncements();
      
      console.log('✅ [FreightManagement] بعد از fetchAnnouncements در handleUpdate:', {
        timestamp: new Date().toISOString()
      });
      
      // Force re-render با تغییر tableKey و refreshTrigger
      const newTableKey = tableKey + 1;
      const newRefreshTrigger = refreshTrigger + 1;
      setTableKey(newTableKey);
      setRefreshTrigger(newRefreshTrigger);
      
      console.log('🔄 [FreightManagement] Force re-render triggered:', {
        newTableKey,
        newRefreshTrigger,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  // حذف اعلام بار (تکی یا گروهی)
  const handleDelete = async () => {
    const idsToDelete =
      deleteTargetIds.length > 0
        ? deleteTargetIds
        : selectedAnnouncement
          ? [selectedAnnouncement.id]
          : [];

    if (idsToDelete.length === 0) return;

    try {
      if (!deleteReason.trim()) {
        alert('لطفاً دلیل حذف را وارد کنید');
        return;
      }

      setIsDeleting(true);
      const succeeded: string[] = [];
      const failed: string[] = [];

      for (const id of idsToDelete) {
        try {
          const res = await fetch(getApiUrl(`freight-announcements/${id}`), {
            method: 'DELETE',
            headers: getHeaders(),
            body: JSON.stringify({ reason: deleteReason }),
            cache: 'no-cache',
          });

          if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || 'خطا در حذف اعلام بار');
          }

          succeeded.push(id);
        } catch {
          failed.push(id);
        }
      }

      if (succeeded.length > 0) {
        setAnnouncements((prev) => prev.filter((ann) => !succeeded.includes(ann.id)));
        setSelectedIds((prev) => prev.filter((id) => !succeeded.includes(id)));
      }

      setShowDeleteDialog(false);
      setSelectedAnnouncement(null);
      setDeleteReason('');
      setDeleteTargetIds([]);

      if (failed.length === 0) {
        alert(
          succeeded.length === 1
            ? 'اعلام بار با موفقیت حذف شد'
            : `${succeeded.length} اعلام بار با موفقیت حذف شد`
        );
      } else if (succeeded.length === 0) {
        alert('حذف انجام نشد. احتمالاً رکورد وابستگی دارد یا خطای سرور رخ داده است.');
      } else {
        alert(`${succeeded.length} مورد حذف شد و ${failed.length} مورد با خطا مواجه شد.`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const statusLabels: Record<string, string> = {
    'Draft': 'پیش‌نویس',
    'PendingManagerApproval': 'در انتظار تایید مدیر',
    'Rejected': 'رد شده',
    'PendingPersonalAssignment': 'در انتظار تخصیص (شخصی)',
    'PendingCompanyAssignment': 'در انتظار تخصیص (شرکت)',
    'Assigned': 'تخصیص یافته',
    'InTransit': 'در حال حمل',
    'Finalized': 'نهایی شده',
    'Cancelled': 'لغو شده'
  };

  const lineTypeLabels: Record<string, string> = {
    'IceCream': 'بستنی',
    'Dairy': 'لبنیات-فروتلند',
    'Ambient': 'پاستوریزه'
  };

  if (loading) {
    return <div className="p-4">در حال بارگذاری...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">مدیریت اعلام بار</h1>
        <p className="text-sm text-gray-600 mt-2">ویرایش و حذف دستی اعلام بارها با ثبت دلیل</p>
      </div>

      {/* فیلترها */}
      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="جستجو (کد اعلام بار، شماره بارنامه، شهر مقصد)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border rounded flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={lineTypeFilter}
          onChange={(e) => setLineTypeFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">همه خطوط</option>
          {Object.entries(lineTypeLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={openBulkDeleteDialog}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 whitespace-nowrap"
          >
            حذف انتخاب‌شده‌ها ({selectedIds.length})
          </button>
        )}
      </div>

      {/* جدول اعلام بارها */}
      <div className="bg-white rounded-lg shadow overflow-hidden" key={`table-wrapper-${refreshTrigger}`}>
        <table className="min-w-full divide-y divide-gray-200" key={`table-${tableKey}`}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 w-10">
                <input
                  type="checkbox"
                  checked={allCurrentPageSelected}
                  onChange={toggleSelectAllCurrentPage}
                  disabled={paginatedAnnouncements.length === 0}
                  title="انتخاب همه ردیف‌های این صفحه"
                />
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">کد</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">خط</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">وضعیت</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">تاریخ بارگیری</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">ارزش بار</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">نوع خودرو</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">نوع تخصیص</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">مقاصد (کرایه)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">بارنامه</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">راننده</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">خودرو</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">کرایه کل</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">عملیات</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedAnnouncements.length > 0 ? paginatedAnnouncements.map((ann, idx) => {
              // لاگ فقط برای ردیف اول و دوم با جزئیات کامل
              if (idx === 0 || idx === 1) {
                const rowData = {
                  id: ann.id,
                  code: ann.announcementCode,
                  loadingDate: ann.loadingDate,
                  totalFreightCost: ann.totalFreightCost,
                  destinations: ann.destinations?.map(d => ({ city: d.city, tonnage: d.tonnage, freightCost: d.freightCost })),
                  status: ann.status,
                  lineType: ann.lineType,
                  originCity: ann.originCity,
                  brand: ann.brand,
                  assignedDriverName: ann.assignedDriverName,
                  assignedVehicleModel: (ann as any).assignedVehicleModel,
                  vehiclePlate: (ann as any).vehiclePlate,
                  billOfLadingNumber: ann.billOfLadingNumber,
                  tableKey,
                  refreshTrigger,
                  timestamp: new Date().toISOString()
                };
                console.log(`🎨 [FreightManagement] Rendering row ${idx}:`, rowData);
                console.log(`📋 [FreightManagement] Rendering row ${idx} (JSON):`, JSON.stringify(rowData, null, 2));
              }
              return (
              <tr 
                key={`${ann.id}-${tableKey}-${idx}`} 
                data-announcement-id={ann.id}
                className={selectedIds.includes(ann.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}
              >
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(ann.id)}
                    onChange={() => toggleRowSelection(ann.id)}
                  />
                </td>
                {/* کد اعلام بار */}
                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-900">
                  {ann.announcementCode || '-'}
                </td>
                {/* خط */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {lineTypeLabels[ann.lineType] || ann.lineType || '-'}
                </td>
                {/* وضعیت */}
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  <span className={`px-2 py-1 rounded text-xs ${
                    ann.status === FreightAnnouncementStatus.Finalized ? 'bg-green-100 text-green-800' :
                    ann.status === FreightAnnouncementStatus.Assigned ? 'bg-blue-100 text-blue-800' :
                    ann.status === FreightAnnouncementStatus.Rejected ? 'bg-red-100 text-red-800' :
                    ann.status === FreightAnnouncementStatus.InTransit ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {statusLabels[ann.status as string] || ann.status}
                  </span>
                </td>
                {/* تاریخ بارگیری */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {ann.loadingDate ? (typeof ann.loadingDate === 'string' ? ann.loadingDate : formatJalali(ann.loadingDate)) : '-'}
                </td>
                {/* ارزش بار */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500" dir="ltr">
                  {ann.cargoValue && Number(ann.cargoValue) > 0 ? formatNumberWithSeparator(ann.cargoValue) : '-'}
                </td>
                {/* نوع خودرو */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {ann.vehicleType || '-'}
                </td>
                {/* نوع تخصیص */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {ann.assignmentType === 'company' ? 'شرکتی' : 
                   ann.assignmentType === 'personal' ? 'شخصی' : '-'}
                </td>
                {/* مقاصد با کرایه */}
                <td className="px-4 py-3 text-xs text-gray-500">
                  {ann.destinations?.length > 0 ? (
                    <div className="space-y-1">
                      {ann.destinations.map((d, i) => (
                        <div key={i}>
                          <span className="font-medium">{d.city || '-'}</span>
                          {d.freightCost && Number(d.freightCost) > 0 && (
                            <span className="text-green-600 mr-1" dir="ltr">
                              ({formatNumberWithSeparator(d.freightCost)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : '-'}
                </td>
                {/* شماره بارنامه */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {ann.billOfLadingNumber || '-'}
                </td>
                {/* راننده */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {(ann as any).assignedDriverName ? (
                    <div>
                      <div className="font-medium">{(ann as any).assignedDriverName}</div>
                      {(ann as any).assignedDriverEmployeeId && (
                        <div className="text-xs text-gray-400">{(ann as any).assignedDriverEmployeeId}</div>
                      )}
                    </div>
                  ) : '-'}
                </td>
                {/* خودرو */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                  {(ann as any).vehiclePlate ? (
                    <div>
                      <div className="font-medium">{(ann as any).vehiclePlate}</div>
                      {((ann as any).assignedVehicleModel || (ann as any).assignedVehicleBrand) && (
                        <div className="text-xs text-gray-400">
                          {[(ann as any).assignedVehicleBrand, (ann as any).assignedVehicleModel].filter(Boolean).join(' ')}
                        </div>
                      )}
                    </div>
                  ) : '-'}
                </td>
                {/* کرایه کل */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 font-medium" dir="ltr">
                  {(() => {
                    // اگر کرایه کل موجود بود نمایش بده
                    if (ann.totalFreightCost && Number(ann.totalFreightCost) > 0) {
                      return formatNumberWithSeparator(Number(ann.totalFreightCost));
                    }
                    // در غیر این صورت از مجموع کرایه مقاصد محاسبه کن
                    const sumFromDest = ann.destinations?.reduce((sum, d) => 
                      sum + (Number(d.freightCost) || 0), 0) || 0;
                    return sumFromDest > 0 ? formatNumberWithSeparator(sumFromDest) : '-';
                  })()}
                </td>
                {/* عملیات */}
                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditDialog(ann)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      ویرایش
                    </button>
                    <button
                      onClick={() => openDeleteDialog(ann)}
                      className="text-red-600 hover:text-red-900"
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => openHistoryDialog(ann)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      لاگ
                    </button>
                  </div>
                </td>
              </tr>
            );
            }) : (
              <tr>
                <td colSpan={14} className="px-4 py-4 text-center text-sm text-gray-500">
                  هیچ اعلام باری یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* صفحه‌بندی */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            نمایش {startIndex + 1} تا {Math.min(endIndex, filteredAnnouncements.length)} از {filteredAnnouncements.length} ردیف
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              قبلی
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 border rounded ${
                      currentPage === pageNum ? 'bg-blue-600 text-white' : ''
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              بعدی
            </button>
          </div>
        </div>
      )}

      {/* دیالوگ ویرایش */}
      {showEditDialog && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h2 className="text-xl font-bold mb-4">ویرایش اعلام بار: {selectedAnnouncement.announcementCode}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">تاریخ بارگیری</label>
                  <input
                    type="text"
                    value={formData.loadingDate}
                    onChange={(e) => setFormData({ ...formData, loadingDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="1404/09/01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نوع خط</label>
                  <select
                    value={formData.lineType}
                    onChange={(e) => setFormData({ ...formData, lineType: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="IceCream">بستنی</option>
                    <option value="Dairy">لبنیات-فروتلند</option>
                    <option value="Ambient">پاستوریزه</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ارزش بار (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rawNumericValues.cargoValue !== undefined ? rawNumericValues.cargoValue : (formData.cargoValue ? String(formData.cargoValue) : '')}
                    onChange={(e) => {
                      // فقط اعداد را نگه دار
                      const cleaned = e.target.value.replace(/[^\d]/g, '');
                      setRawNumericValues({ ...rawNumericValues, cargoValue: cleaned });
                      setFormData({ ...formData, cargoValue: cleaned ? Number(cleaned) : 0 });
                    }}
                    onBlur={(e) => {
                      // فرمت کردن هنگام خروج از فیلد
                      const num = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                      setFormData({ ...formData, cargoValue: num });
                      setRawNumericValues({ ...rawNumericValues, cargoValue: num ? formatNumberWithSeparator(num) : '' });
                    }}
                    className="w-full px-3 py-2 border rounded"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نوع خودرو</label>
                  <input
                    type="text"
                    value={formData.vehicleType}
                    onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                {formData.lineType === 'IceCream' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">مبدا بارگیری</label>
                      <input
                        type="text"
                        value={formData.originCity || ''}
                        onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">برند</label>
                      <input
                        type="text"
                        value={formData.brand || ''}
                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                  </>
                )}
                {/* فیلدهای تخصیص */}
                <div>
                  <label className="block text-sm font-medium mb-1">نوع تخصیص</label>
                  <select
                    value={formData.assignmentType || ''}
                    onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">انتخاب کنید</option>
                    <option value="company">شرکتی</option>
                    <option value="personal">شخصی</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">راننده</label>
                  <input
                    type="text"
                    value={formData.assignedDriverName || ''}
                    onChange={(e) => setFormData({ ...formData, assignedDriverName: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="نام راننده"
                  />
                  {formData.assignedDriverEmployeeId && (
                    <div className="text-xs text-gray-500 mt-1">کد پرسنلی: {formData.assignedDriverEmployeeId}</div>
                  )}
                  <input
                    type="hidden"
                    value={formData.assignedDriverId || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">خودرو</label>
                  <input
                    type="text"
                    value={formData.vehiclePlate || ''}
                    onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="پلاک خودرو"
                  />
                  {((formData.assignedVehicleModel || formData.assignedVehicleBrand)) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {[formData.assignedVehicleBrand, formData.assignedVehicleModel].filter(Boolean).join(' ')}
                    </div>
                  )}
                  <input
                    type="hidden"
                    value={formData.assignedVehicleId || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">کرایه کل (ریال)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rawNumericValues.totalFreightCost !== undefined ? rawNumericValues.totalFreightCost : (formData.totalFreightCost ? String(formData.totalFreightCost) : '')}
                    onChange={(e) => {
                      // فقط اعداد را نگه دار
                      const cleaned = e.target.value.replace(/[^\d]/g, '');
                      setRawNumericValues({ ...rawNumericValues, totalFreightCost: cleaned });
                      setFormData({ ...formData, totalFreightCost: cleaned ? Number(cleaned) : 0 });
                    }}
                    onBlur={(e) => {
                      // فرمت کردن هنگام خروج از فیلد
                      const num = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                      setFormData({ ...formData, totalFreightCost: num });
                      setRawNumericValues({ ...rawNumericValues, totalFreightCost: num ? formatNumberWithSeparator(num) : '' });
                    }}
                    className="w-full px-3 py-2 border rounded"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">شماره بارنامه</label>
                  <input
                    type="text"
                    value={formData.billOfLadingNumber || ''}
                    onChange={(e) => setFormData({ ...formData, billOfLadingNumber: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>
              
              {/* مقاصد */}
              <div>
                <label className="block text-sm font-medium mb-2">مقاصد</label>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
                  {formData.destinations && formData.destinations.length > 0 ? (
                    formData.destinations.map((dest: any, index: number) => (
                      <div key={dest.id || index} className="grid grid-cols-4 gap-2 p-2 bg-gray-50 rounded">
                        <input
                          type="text"
                          value={dest.city || ''}
                          onChange={(e) => {
                            const newDests = [...formData.destinations];
                            newDests[index] = { ...newDests[index], city: e.target.value };
                            setFormData({ ...formData, destinations: newDests });
                          }}
                          className="px-2 py-1 border rounded text-sm"
                          placeholder="شهر"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={rawNumericValues.destinations?.[index]?.tonnage !== undefined 
                            ? rawNumericValues.destinations[index].tonnage 
                            : (dest.tonnage ? String(dest.tonnage) : '')}
                          onChange={(e) => {
                            // فقط اعداد را نگه دار
                            const cleaned = e.target.value.replace(/[^\d]/g, '');
                            const newRaw = { ...rawNumericValues };
                            if (!newRaw.destinations) newRaw.destinations = {};
                            if (!newRaw.destinations[index]) newRaw.destinations[index] = {};
                            newRaw.destinations[index].tonnage = cleaned;
                            setRawNumericValues(newRaw);
                            
                            const newDests = [...formData.destinations];
                            newDests[index] = { ...newDests[index], tonnage: cleaned ? Number(cleaned) : 0 };
                            setFormData({ ...formData, destinations: newDests });
                          }}
                          onBlur={(e) => {
                            // فرمت کردن هنگام خروج از فیلد
                            const num = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                            const newDests = [...formData.destinations];
                            newDests[index] = { ...newDests[index], tonnage: num };
                            setFormData({ ...formData, destinations: newDests });
                            
                            const newRaw = { ...rawNumericValues };
                            if (!newRaw.destinations) newRaw.destinations = {};
                            if (!newRaw.destinations[index]) newRaw.destinations[index] = {};
                            newRaw.destinations[index].tonnage = num ? formatNumberWithSeparator(num) : '';
                            setRawNumericValues(newRaw);
                          }}
                          className="px-2 py-1 border rounded text-sm"
                          placeholder="تناژ (کیلوگرم)"
                          dir="ltr"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={rawNumericValues.destinations?.[index]?.freightCost !== undefined 
                            ? rawNumericValues.destinations[index].freightCost 
                            : (dest.freightCost ? String(dest.freightCost) : '')}
                          onChange={(e) => {
                            // فقط اعداد را نگه دار
                            const cleaned = e.target.value.replace(/[^\d]/g, '');
                            const newRaw = { ...rawNumericValues };
                            if (!newRaw.destinations) newRaw.destinations = {};
                            if (!newRaw.destinations[index]) newRaw.destinations[index] = {};
                            newRaw.destinations[index].freightCost = cleaned;
                            setRawNumericValues(newRaw);
                            
                            const newDests = [...formData.destinations];
                            newDests[index] = { ...newDests[index], freightCost: cleaned ? Number(cleaned) : 0 };
                            setFormData({ ...formData, destinations: newDests });
                          }}
                          onBlur={(e) => {
                            // فرمت کردن هنگام خروج از فیلد
                            const num = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                            const newDests = [...formData.destinations];
                            newDests[index] = { ...newDests[index], freightCost: num };
                            setFormData({ ...formData, destinations: newDests });
                            
                            const newRaw = { ...rawNumericValues };
                            if (!newRaw.destinations) newRaw.destinations = {};
                            if (!newRaw.destinations[index]) newRaw.destinations[index] = {};
                            newRaw.destinations[index].freightCost = num ? formatNumberWithSeparator(num) : '';
                            setRawNumericValues(newRaw);
                          }}
                          className="px-2 py-1 border rounded text-sm"
                          placeholder="کرایه (ریال)"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newDests = formData.destinations.filter((_: any, i: number) => i !== index);
                            setFormData({ ...formData, destinations: newDests });
                          }}
                          className="px-2 py-1 bg-red-500 text-white rounded text-sm"
                        >
                          حذف
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">مقصدی ثبت نشده است</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const newDests = [...(formData.destinations || []), { city: '', tonnage: 0, freightCost: 0 }];
                      setFormData({ ...formData, destinations: newDests });
                    }}
                    className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm"
                  >
                    + افزودن مقصد
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">یادداشت</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">دلیل تغییر *</label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                  placeholder="لطفاً دلیل تغییر را وارد کنید"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setSelectedAnnouncement(null);
                  setEditReason('');
                }}
                className="px-4 py-2 border rounded"
              >
                انصراف
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ حذف */}
      {showDeleteDialog && deleteTargetIds.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">حذف اعلام بار</h2>
            {deleteTargetIds.length > 1 ? (
              <p className="mb-4">
                آیا از حذف <strong>{deleteTargetIds.length}</strong> اعلام بار انتخاب‌شده مطمئن هستید؟
              </p>
            ) : (
              <p className="mb-4">
                آیا از حذف اعلام بار{' '}
                <strong>
                  {selectedAnnouncement?.announcementCode ||
                    announcements.find((ann) => ann.id === deleteTargetIds[0])?.announcementCode ||
                    '-'}
                </strong>{' '}
                مطمئن هستید؟
              </p>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">دلیل حذف *</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                rows={3}
                placeholder="لطفاً دلیل حذف را وارد کنید"
              />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setSelectedAnnouncement(null);
                  setDeleteReason('');
                  setDeleteTargetIds([]);
                }}
                className="px-4 py-2 border rounded"
                disabled={isDeleting}
              >
                انصراف
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'در حال حذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ تاریخچه */}
      {showHistoryDialog && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-5xl max-h-[85vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">تاریخچه تغییرات: {selectedAnnouncement.announcementCode}</h2>
              <button
                onClick={() => setShowHistoryDialog(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-right text-xs font-medium">کاربر</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">نوع عملیات</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">تغییرات</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">دلیل</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">تاریخ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">
                        هیچ تغییری ثبت نشده است
                      </td>
                    </tr>
                  ) : (
                    history.map(action => {
                      console.log('📋 [FreightManagement] Rendering history action:', action);
                      
                      // محاسبه تغییرات از oldValue و newValue
                      const getChangedFields = () => {
                        if (!action.oldValue && !action.newValue) return [];
                        if (action.actionType === 'create') return [{ label: 'ایجاد', value: 'رکورد جدید ایجاد شد' }];
                        if (action.actionType === 'delete') return [{ label: 'حذف', value: 'رکورد حذف شد' }];
                        
                        const changes: { label: string; oldVal: any; newVal: any }[] = [];
                        const fieldLabels: Record<string, string> = {
                          loading_date: 'تاریخ بارگیری',
                          loadingDate: 'تاریخ بارگیری',
                          line_type: 'نوع خط',
                          lineType: 'نوع خط',
                          cargo_value: 'ارزش بار',
                          cargoValue: 'ارزش بار',
                          vehicle_type: 'نوع خودرو',
                          vehicleType: 'نوع خودرو',
                          status: 'وضعیت',
                          notes: 'یادداشت',
                          total_freight_cost: 'کرایه کل',
                          totalFreightCost: 'کرایه کل',
                          bill_of_lading_number: 'شماره بارنامه',
                          billOfLadingNumber: 'شماره بارنامه',
                          assigned_driver_name: 'نام راننده',
                          assignedDriverName: 'نام راننده',
                          assigned_driver_id: 'راننده',
                          assignedDriverId: 'راننده',
                          assigned_vehicle_id: 'خودرو',
                          assignedVehicleId: 'خودرو',
                          vehicle_plate: 'پلاک خودرو',
                          vehiclePlate: 'پلاک خودرو',
                          assignment_type: 'نوع تخصیص',
                          assignmentType: 'نوع تخصیص',
                          origin_city: 'مبدا',
                          originCity: 'مبدا',
                          brand: 'برند',
                          carton_count: 'تعداد کارتن',
                          cartonCount: 'تعداد کارتن',
                          platform_arrival_time: 'ساعت حضور',
                          platformArrivalTime: 'ساعت حضور',
                          destinations: 'مقاصد'
                        };
                        
                        const old = action.oldValue || {};
                        const newVal = action.newValue || {};
                        
                        // بررسی فیلدهای اصلی
                        Object.keys(fieldLabels).forEach(key => {
                          const oldValue = old[key];
                          const newValue = newVal[key];
                          
                          // تبدیل به string برای مقایسه
                          const oldStr = JSON.stringify(oldValue);
                          const newStr = JSON.stringify(newValue);
                          
                          if (oldStr !== newStr && (oldValue !== undefined || newValue !== undefined)) {
                            // فرمت کردن مقادیر عددی
                            let displayOld = oldValue;
                            let displayNew = newValue;
                            
                            if (key.includes('freight_cost') || key.includes('FreightCost') || 
                                key.includes('cargo_value') || key.includes('cargoValue')) {
                              displayOld = oldValue ? formatNumberWithSeparator(oldValue) : '-';
                              displayNew = newValue ? formatNumberWithSeparator(newValue) : '-';
                            }
                            
                            if (key === 'destinations' && Array.isArray(newValue)) {
                              // نمایش تغییرات مقاصد
                              const destChanges = newValue.map((d: any, i: number) => 
                                `${d.city || '-'}: ${formatNumberWithSeparator(d.freight_cost || d.freightCost || 0)}`
                              ).join(' | ');
                              changes.push({ label: 'مقاصد', oldVal: null, newVal: destChanges });
                            } else if (key !== 'destinations') {
                              changes.push({ label: fieldLabels[key], oldVal: displayOld, newVal: displayNew });
                            }
                          }
                        });
                        
                        return changes;
                      };
                      
                      const changedFields = getChangedFields();
                      
                      return (
                        <tr key={action.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm">{action.userName} ({action.userRole})</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              action.actionType === 'create' ? 'bg-green-100 text-green-800' :
                              action.actionType === 'update' ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {action.actionType === 'create' ? 'ایجاد' :
                               action.actionType === 'update' ? 'ویرایش' : 'حذف'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {changedFields.length > 0 ? (
                              <div className="space-y-1 text-xs">
                                {changedFields.slice(0, 5).map((change, idx) => (
                                  <div key={idx} className="flex gap-1 flex-wrap">
                                    <span className="font-medium text-gray-700">{change.label}:</span>
                                    {change.oldVal !== null && change.oldVal !== undefined && (
                                      <>
                                        <span className="text-red-500 line-through">{String(change.oldVal || '-')}</span>
                                        <span className="text-gray-400">→</span>
                                      </>
                                    )}
                                    <span className="text-green-600">{String(change.newVal || '-')}</span>
                                  </div>
                                ))}
                                {changedFields.length > 5 && (
                                  <div className="text-gray-400">و {changedFields.length - 5} تغییر دیگر...</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm">{action.reason || '-'}</td>
                          <td className="px-4 py-2 text-sm whitespace-nowrap">{formatJalaliDateTime(action.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default FreightManagement;

