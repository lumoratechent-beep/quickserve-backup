import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CalendarDays, CalendarPlus, Copy, CreditCard, Download, Edit3, Eye, FileText, MoreVertical, Plus, Receipt, RotateCcw, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Restaurant } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from './Toast';
import { syncBackofficeToDb } from '../lib/sharedSettings';

type StaffRole = 'CASHIER' | 'KITCHEN' | 'ORDER_TAKER' | 'MANAGER' | 'HR';
type ContributionMode = 'fixed' | 'percentage';
type StaffEmploymentStatus = 'Active' | 'Probation' | 'Inactive' | 'Resigned';
type LeaveType = 'MC' | 'Hospitalization' | 'Paternity' | 'Annual' | 'Other';
type LeaveStatus = 'scheduled' | 'approved' | 'completed' | 'cancelled';

interface LeaveEntitlementRule {
  enabled: boolean;
  days: number;
}

interface AnnualLeaveLevel {
  id: string;
  serviceYear: number;
  days: number;
}

interface StaffLeaveEntitlements {
  types: Record<LeaveType, LeaveEntitlementRule>;
  annualLevelsEnabled: boolean;
  annualLevels: AnnualLeaveLevel[];
}

interface StaffDepartment {
  id: string;
  restaurant_id: string;
  name: string;
  code?: string | null;
  is_active?: boolean;
}

interface StaffProfile {
  id?: string;
  restaurant_id: string;
  user_id: string;
  department_id?: string | null;
  employee_code?: string | null;
  full_name?: string | null;
  ic_number?: string | null;
  nationality?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  job_title?: string | null;
  employment_type?: string | null;
  employment_status?: string | null;
  hire_date?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  epf_no?: string | null;
  socso_no?: string | null;
  tax_no?: string | null;
  salary_amount?: number | null;
  pay_frequency?: string | null;
  overtime_rate?: number | null;
  default_allowances?: Record<string, number> | null;
  default_deductions?: Record<string, number> | null;
  leave_entitlements?: StaffLeaveEntitlements | null;
  notes?: string | null;
}

interface StaffMember {
  id: string;
  username: string;
  role: StaffRole;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
  kitchen_categories?: string[] | null;
  profile?: StaffProfile;
}

interface PayrollPayslip {
  id: string;
  restaurant_id: string;
  staff_user_id: string;
  staff_profile_id?: string | null;
  pay_period: string;
  pay_date: string;
  basic_salary: number;
  overtime_amount: number;
  allowance_amount: number;
  bonus_amount: number;
  gross_pay: number;
  epf_employee: number;
  epf_employer: number;
  socso_employee: number;
  eis_employee: number;
  socso_employer?: number;
  eis_employer?: number;
  tax_pcb: number;
  unpaid_leave_deduction: number;
  other_deductions: number;
  other_deduction_name?: string | null;
  other_contribution_name?: string | null;
  other_contribution_amount?: number;
  net_pay: number;
  payment_method?: string | null;
  status: 'draft' | 'approved' | 'paid';
  notes?: string | null;
  created_at?: string;
}

interface StaffClaim {
  id: string;
  restaurant_id: string;
  staff_user_id: string;
  staff_profile_id?: string | null;
  claim_period: string;
  claim_date: string;
  total_amount: number;
  payment_method: string;
  status: 'draft' | 'approved' | 'paid';
  notes: string;
  staff_name?: string | null;
  staff_role?: string | null;
  items: StaffClaimItem[];
  created_at?: string;
}

interface StaffClaimItem {
  id: string;
  claim_id?: string;
  claim_type: string;
  amount: number;
  receipt_ref?: string | null;
  notes?: string | null;
}

interface StaffLeave {
  id: string;
  restaurant_id: string;
  staff_user_id: string;
  staff_profile_id?: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  status: LeaveStatus;
  notes?: string | null;
  staff_name?: string | null;
  staff_role?: string | null;
  created_at?: string;
}

interface StaffForm {
  username: string;
  password: string;
  email: string;
  phone: string;
  role: StaffRole;
  departmentId: string;
  fullName: string;
  employeeCode: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  hireDate: string;
  icNumber: string;
  nationality: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankName: string;
  bankAccountNo: string;
  epfNo: string;
  socsoNo: string;
  taxNo: string;
  salaryAmount: number;
  payFrequency: string;
  overtimeRate: number;
  defaultAllowance: number;
  defaultDeduction: number;
  leaveEntitlements: StaffLeaveEntitlements;
  notes: string;
}

interface PayrollForm {
  staffUserId: string;
  payPeriod: string;
  payDate: string;
  basicSalary: number;
  overtimeAmount: number;
  allowanceAmount: number;
  bonusAmount: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  eisEmployee: number;
  socsoEmployer: number;
  eisEmployer: number;
  taxPcb: number;
  unpaidLeaveDeduction: number;
  otherDeductionName: string;
  otherDeductions: number;
  otherContributionName: string;
  otherContributionAmount: number;
  paymentMethod: string;
  status: 'draft' | 'approved' | 'paid';
  notes: string;
}

interface ClaimForm {
  staffUserId: string;
  claimDate: string;
  claimPeriod: string;
  paymentMethod: string;
  status: 'draft' | 'approved' | 'paid';
  notes: string;
  items: ClaimLineForm[];
}

interface ClaimLineForm {
  id: string;
  claimType: string;
  amount: number;
  receiptRef: string;
  notes: string;
}

interface LeaveForm {
  staffUserId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: LeaveStatus;
  notes: string;
}

interface OvertimeEntry {
  id: string;
  hours: number;
  multiplier: number;
}

interface Props {
  restaurant: Restaurant;
  currencySymbol: string;
}

type FloatingActionMenuType = 'staff' | 'payslip' | 'claim' | 'leave';

interface FloatingActionMenu {
  type: FloatingActionMenuType;
  id: string;
  top: number;
  left: number;
  width: number;
}

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const percentageAmount = (base: number, percentage: number) => Number(((n(base) * n(percentage)) / 100).toFixed(2));

const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const blankOvertimeEntry = (): OvertimeEntry => ({ id: crypto.randomUUID(), hours: 0, multiplier: 1.5 });
const overtimeMultipliers = [1, 1.5, 2, 2.5, 3];
const claimTypes = ['Meals', 'Travel', 'Mileage', 'Medical', 'Supplies', 'Training', 'Other'];
const leaveTypes: LeaveType[] = ['MC', 'Hospitalization', 'Paternity', 'Annual', 'Other'];
const leaveStatusOptions: LeaveStatus[] = ['scheduled', 'approved', 'completed', 'cancelled'];
const periodMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const currentYear = new Date().getFullYear();
const periodYears = Array.from({ length: 9 }, (_, index) => currentYear - 4 + index);
const parsePeriodLabel = (value?: string | null) => {
  const [rawMonth, rawYear] = String(value || monthLabel()).split(' ');
  const month = periodMonths.includes(rawMonth) ? rawMonth : periodMonths[new Date().getMonth()];
  const parsedYear = Number(rawYear);
  const year = Number.isFinite(parsedYear) ? parsedYear : currentYear;
  return { month, year };
};
const periodLabelFromParts = (month: string, year: number | string) => `${month} ${year}`;
const blankClaimLine = (): ClaimLineForm => ({ id: crypto.randomUUID(), claimType: 'Meals', amount: 0, receiptRef: '', notes: '' });
const defaultLeaveEntitlements = (): StaffLeaveEntitlements => ({
  types: {
    MC: { enabled: false, days: 0 },
    Hospitalization: { enabled: false, days: 0 },
    Paternity: { enabled: false, days: 0 },
    Annual: { enabled: false, days: 0 },
    Other: { enabled: false, days: 0 },
  },
  annualLevelsEnabled: false,
  annualLevels: [
    { id: crypto.randomUUID(), serviceYear: 1, days: 8 },
    { id: crypto.randomUUID(), serviceYear: 2, days: 9 },
  ],
});

const normalizeLeaveEntitlements = (value?: Partial<StaffLeaveEntitlements> | null): StaffLeaveEntitlements => {
  const defaults = defaultLeaveEntitlements();
  const types = leaveTypes.reduce((acc, type) => {
    const rule = value?.types?.[type];
    acc[type] = { enabled: Boolean(rule?.enabled), days: n(rule?.days) };
    return acc;
  }, {} as Record<LeaveType, LeaveEntitlementRule>);
  const levels = Array.isArray(value?.annualLevels) && value.annualLevels.length
    ? value.annualLevels.map(level => ({
      id: level.id || crypto.randomUUID(),
      serviceYear: Math.max(1, Math.round(n(level.serviceYear) || 1)),
      days: n(level.days),
    }))
    : defaults.annualLevels;

  return {
    types,
    annualLevelsEnabled: Boolean(value?.annualLevelsEnabled),
    annualLevels: levels,
  };
};

const blankLeaveForm = (): LeaveForm => {
  const today = new Date().toISOString().split('T')[0];
  return {
    staffUserId: '',
    leaveType: 'Annual',
    startDate: today,
    endDate: today,
    totalDays: 1,
    status: 'scheduled',
    notes: '',
  };
};

const dateOnlyTime = (value?: string | null) => {
  const date = new Date(`${value || new Date().toISOString().split('T')[0]}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date().setHours(0, 0, 0, 0) : date.getTime();
};

const inclusiveLeaveDays = (startDate: string, endDate: string) => {
  const start = dateOnlyTime(startDate);
  const end = dateOnlyTime(endDate);
  if (end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
};

const serviceYearsCompleted = (hireDate?: string | null) => {
  if (!hireDate) return 0;
  const hired = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hired.getTime())) return 0;
  const today = new Date();
  let years = today.getFullYear() - hired.getFullYear();
  const hasAnniversaryPassed = today.getMonth() > hired.getMonth() || (today.getMonth() === hired.getMonth() && today.getDate() >= hired.getDate());
  if (!hasAnniversaryPassed) years -= 1;
  return Math.max(0, years);
};

const getCurrentLeaveEntitlement = (profile: StaffProfile | undefined, type: LeaveType) => {
  const entitlements = normalizeLeaveEntitlements(profile?.leave_entitlements);
  const baseRule = entitlements.types[type];
  if (!baseRule.enabled) return null;
  if (type !== 'Annual') return baseRule.days;

  const serviceYears = serviceYearsCompleted(profile?.hire_date);
  let annualDays = baseRule.days;
  if (entitlements.annualLevelsEnabled) {
    const matchedLevel = [...entitlements.annualLevels]
      .filter(level => serviceYears + 1 >= level.serviceYear)
      .sort((a, b) => b.serviceYear - a.serviceYear)[0];
    if (matchedLevel) annualDays = n(matchedLevel.days);
  }
  return annualDays;
};

const blankStaffForm = (): StaffForm => ({
  username: '',
  password: '',
  email: '',
  phone: '',
  role: 'CASHIER',
  departmentId: '',
  fullName: '',
  employeeCode: '',
  jobTitle: '',
  employmentType: 'Full-time',
  employmentStatus: 'Active',
  hireDate: new Date().toISOString().split('T')[0],
  icNumber: '',
  nationality: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  bankName: '',
  bankAccountNo: '',
  epfNo: '',
  socsoNo: '',
  taxNo: '',
  salaryAmount: 0,
  payFrequency: 'Monthly',
  overtimeRate: 0,
  defaultAllowance: 0,
  defaultDeduction: 0,
  leaveEntitlements: defaultLeaveEntitlements(),
  notes: '',
});

const blankPayrollForm = (): PayrollForm => ({
  staffUserId: '',
  payPeriod: monthLabel(),
  payDate: new Date().toISOString().split('T')[0],
  basicSalary: 0,
  overtimeAmount: 0,
  allowanceAmount: 0,
  bonusAmount: 0,
  epfEmployee: 0,
  epfEmployer: 0,
  socsoEmployee: 0,
  eisEmployee: 0,
  socsoEmployer: 0,
  eisEmployer: 0,
  taxPcb: 0,
  unpaidLeaveDeduction: 0,
  otherDeductionName: 'Other Deductions',
  otherDeductions: 0,
  otherContributionName: 'Other Contribution',
  otherContributionAmount: 0,
  paymentMethod: 'Bank Transfer',
  status: 'draft',
  notes: '',
});

const blankClaimForm = (): ClaimForm => ({
  staffUserId: '',
  claimDate: new Date().toISOString().split('T')[0],
  claimPeriod: monthLabel(),
  paymentMethod: 'Bank Transfer',
  status: 'draft',
  notes: '',
  items: [blankClaimLine()],
});

const StaffManagementView: React.FC<Props> = ({ restaurant, currencySymbol }) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [staffClaims, setStaffClaims] = useState<StaffClaim[]>([]);
  const [staffLeaves, setStaffLeaves] = useState<StaffLeave[]>([]);
  const [subTab, setSubTab] = useState<'directory' | 'leave' | 'payroll' | 'claims' | 'departments'>('directory');
  const [search, setSearch] = useState('');
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm>(() => blankStaffForm());
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [isPayslipFormOpen, setIsPayslipFormOpen] = useState(false);
  const [payrollForm, setPayrollForm] = useState<PayrollForm>(() => blankPayrollForm());
  const [overtimeRate, setOvertimeRate] = useState(0);
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>(() => [blankOvertimeEntry()]);
  const [isOvertimeOpen, setIsOvertimeOpen] = useState(false);
  const [epfEmployeeMode, setEpfEmployeeMode] = useState<ContributionMode>('percentage');
  const [epfEmployeePercent, setEpfEmployeePercent] = useState(11);
  const [epfEmployerMode, setEpfEmployerMode] = useState<ContributionMode>('percentage');
  const [epfEmployerPercent, setEpfEmployerPercent] = useState(13);
  const [isSavingPayslip, setIsSavingPayslip] = useState(false);
  const [editingPayslipId, setEditingPayslipId] = useState<string | null>(null);
  const [previewPayslip, setPreviewPayslip] = useState<PayrollPayslip | null>(null);
  const [payslipSearch, setPayslipSearch] = useState('');
  const [payslipStatusFilter, setPayslipStatusFilter] = useState<'all' | PayrollPayslip['status']>('all');
  const [isClaimFormOpen, setIsClaimFormOpen] = useState(false);
  const [claimForm, setClaimForm] = useState<ClaimForm>(() => blankClaimForm());
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [isSavingClaim, setIsSavingClaim] = useState(false);
  const [claimSearch, setClaimSearch] = useState('');
  const [isLeaveFormOpen, setIsLeaveFormOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState<LeaveForm>(() => blankLeaveForm());
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [leaveSearch, setLeaveSearch] = useState('');
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [floatingActionMenu, setFloatingActionMenu] = useState<FloatingActionMenu | null>(null);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [staffDetailPage, setStaffDetailPage] = useState(0);

  const fmt = (value: number) => `${currencySymbol}${n(value).toFixed(2)}`;
  const statusOptionClass = 'bg-white text-gray-900';
  const getPayFrequencyLabel = (frequency?: string | null) => (frequency === 'Monthly' || !frequency ? 'mo' : frequency);
  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const getStaffStatusClass = (status: StaffEmploymentStatus) => {
    if (status === 'Active') return 'bg-emerald-100 text-emerald-700 focus:ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300';
    if (status === 'Probation') return 'bg-amber-100 text-amber-700 focus:ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300';
    return 'bg-rose-100 text-rose-700 focus:ring-rose-300 dark:bg-rose-500/20 dark:text-rose-300';
  };
  const isFloatingMenuOpen = (type: FloatingActionMenuType, id: string) => floatingActionMenu?.type === type && floatingActionMenu.id === id;
  const openStaffDetail = (item: StaffMember) => {
    setStaffDetailId(item.id);
    setStaffDetailPage(0);
  };
  const openFloatingActionMenu = (event: React.MouseEvent<HTMLButtonElement>, type: FloatingActionMenuType, id: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = type === 'claim' || type === 'leave' ? 160 : 176;
    const estimatedHeight = type === 'claim' || type === 'leave' ? 92 : 224;
    const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
    const opensUp = rect.bottom + estimatedHeight > window.innerHeight - 8;
    const top = opensUp ? Math.max(8, rect.top - estimatedHeight - 6) : Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - 8);
    setFloatingActionMenu({ type, id, top, left, width });
  };

  const cacheStaff = useCallback((items: StaffMember[]) => {
    setStaff(items);
    localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(items.map(item => ({
      id: item.id,
      username: item.username,
      role: item.role,
      email: item.email,
      phone: item.phone,
      isActive: item.is_active ?? true,
      kitchenCategories: item.kitchen_categories,
      profile: item.profile,
    }))));
    syncBackofficeToDb(restaurant.id);
  }, [restaurant.id]);

  const refresh = useCallback(async (showToast = false) => {
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, username, role, email, phone, is_active, kitchen_categories')
      .eq('restaurant_id', restaurant.id)
      .in('role', ['CASHIER', 'KITCHEN', 'ORDER_TAKER', 'MANAGER', 'HR']);

    if (usersError) {
      toast(usersError.message || 'Failed to load staff', 'error');
      return;
    }

    const [deptRes, profileRes, payslipRes, claimRes, leaveRes] = await Promise.all([
      supabase.from('staff_departments').select('*').eq('restaurant_id', restaurant.id).order('name', { ascending: true }),
      supabase.from('staff_profiles').select('*').eq('restaurant_id', restaurant.id),
      supabase.from('payroll_payslips').select('*').eq('restaurant_id', restaurant.id).order('pay_date', { ascending: false }),
      supabase.from('staff_claims').select('*, staff_claim_items(*)').eq('restaurant_id', restaurant.id).order('claim_date', { ascending: false }),
      supabase.from('staff_leaves').select('*').eq('restaurant_id', restaurant.id).order('start_date', { ascending: false }),
    ]);

    if (deptRes.error || profileRes.error || payslipRes.error || claimRes.error || leaveRes.error) {
      console.warn('Apply migrations 038_staff_hr_payroll.sql, 041_staff_claims.sql, and 050_hr_leave_management.sql to enable HR/payroll tables.', { deptRes, profileRes, payslipRes, claimRes, leaveRes });
    }

    const profileByUser = new Map(((profileRes.data || []) as StaffProfile[]).map(profile => [profile.user_id, {
      ...profile,
      leave_entitlements: normalizeLeaveEntitlements(profile.leave_entitlements),
    }]));
    const mapped = (usersData || []).map((user: any) => ({
      ...user,
      role: user.role as StaffRole,
      profile: profileByUser.get(user.id),
    })) as StaffMember[];

    setDepartments((deptRes.data || []) as StaffDepartment[]);
    setPayslips((payslipRes.data || []) as PayrollPayslip[]);
    setStaffClaims(((claimRes.data || []) as any[]).map(row => {
      const item = mapped.find(staffItem => staffItem.id === row.staff_user_id);
      return {
        id: row.id,
        restaurant_id: row.restaurant_id,
        staff_user_id: row.staff_user_id,
        staff_profile_id: row.staff_profile_id || null,
        claim_period: row.claim_period || monthLabel(),
        claim_date: row.claim_date,
        total_amount: n(row.total_amount),
        payment_method: row.payment_method || 'Bank Transfer',
        status: row.status || 'draft',
        notes: row.notes || '',
        staff_name: item?.profile?.full_name || item?.username || null,
        staff_role: item?.role || null,
        items: ((row.staff_claim_items || []) as any[]).map(claimItem => ({
          id: claimItem.id,
          claim_id: claimItem.claim_id,
          claim_type: claimItem.claim_type || 'Staff Claim',
          amount: n(claimItem.amount),
          receipt_ref: claimItem.receipt_ref || null,
          notes: claimItem.notes || null,
        })),
        created_at: row.created_at,
      } as StaffClaim;
    }));
    setStaffLeaves(((leaveRes.data || []) as any[]).map(row => {
      const item = mapped.find(staffItem => staffItem.id === row.staff_user_id);
      return {
        id: row.id,
        restaurant_id: row.restaurant_id,
        staff_user_id: row.staff_user_id,
        staff_profile_id: row.staff_profile_id || null,
        leave_type: row.leave_type || 'Other',
        start_date: row.start_date,
        end_date: row.end_date,
        total_days: n(row.total_days),
        status: row.status || 'scheduled',
        notes: row.notes || null,
        staff_name: item?.profile?.full_name || item?.username || null,
        staff_role: item?.role || null,
        created_at: row.created_at,
      } as StaffLeave;
    }));
    cacheStaff(mapped);
    if (showToast) toast('Staff data refreshed', 'success');
  }, [cacheStaff, restaurant.id]);

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  const visibleStaff = useMemo(() => {
    if (!search.trim()) return staff;
    const q = search.toLowerCase();
    return staff.filter(item => {
      const dept = departments.find(department => department.id === item.profile?.department_id)?.name || '';
      return [item.username, item.role, item.email, item.phone, item.profile?.full_name, item.profile?.employee_code, item.profile?.job_title, dept]
        .some(value => (value || '').toLowerCase().includes(q));
    });
  }, [departments, search, staff]);

  const visiblePayslips = useMemo(() => {
    const q = payslipSearch.trim().toLowerCase();
    return payslips.filter(payslip => {
      if (payslipStatusFilter !== 'all' && payslip.status !== payslipStatusFilter) return false;
      if (!q) return true;
      const item = staff.find(staffItem => staffItem.id === payslip.staff_user_id);
      const department = departments.find(dept => dept.id === item?.profile?.department_id);
      return [
        item?.profile?.full_name,
        item?.username,
        item?.profile?.employee_code,
        item?.role,
        department?.name,
        payslip.pay_period,
        payslip.pay_date,
        payslip.status,
        payslip.notes,
      ].some(value => (value || '').toLowerCase().includes(q));
    });
  }, [departments, payslipSearch, payslipStatusFilter, payslips, staff]);

  const visibleClaims = useMemo(() => {
    const q = claimSearch.trim().toLowerCase();
    if (!q) return staffClaims;
    return staffClaims.filter(claim => [
      claim.staff_name,
      claim.staff_role,
      claim.claim_period,
      claim.payment_method,
      claim.status,
      claim.notes,
      ...claim.items.flatMap(item => [item.claim_type, item.receipt_ref, item.notes]),
    ].some(value => (value || '').toLowerCase().includes(q)));
  }, [claimSearch, staffClaims]);

  const visibleLeaves = useMemo(() => {
    const q = leaveSearch.trim().toLowerCase();
    if (!q) return staffLeaves;
    return staffLeaves.filter(leave => [
      leave.staff_name,
      leave.staff_role,
      leave.leave_type,
      leave.start_date,
      leave.end_date,
      leave.status,
      leave.notes,
    ].some(value => (value || '').toLowerCase().includes(q)));
  }, [leaveSearch, staffLeaves]);

  const peopleOnLeaveToday = useMemo(() => {
    const today = dateOnlyTime(new Date().toISOString().split('T')[0]);
    return staffLeaves
      .filter(leave => leave.status !== 'cancelled' && dateOnlyTime(leave.start_date) <= today && dateOnlyTime(leave.end_date) >= today)
      .sort((a, b) => a.staff_name?.localeCompare(b.staff_name || '') || 0);
  }, [staffLeaves]);

  const getLeaveEntitlementLabel = (item: StaffMember, type: LeaveType) => {
    const entitlement = getCurrentLeaveEntitlement(item.profile, type);
    return entitlement === null ? 'Not set' : `${entitlement} days`;
  };

  const getLeaveTakenForStaff = (staffUserId: string, type: LeaveType) => {
    const currentYear = new Date().getFullYear();
    return staffLeaves
      .filter(leave => (
        leave.staff_user_id === staffUserId
        && leave.leave_type === type
        && leave.status !== 'cancelled'
        && new Date(`${leave.start_date}T00:00:00`).getFullYear() === currentYear
      ))
      .reduce((sum, leave) => sum + n(leave.total_days), 0);
  };

  const getLeaveBalanceForStaff = (item: StaffMember, type: LeaveType) => {
    const entitlement = getCurrentLeaveEntitlement(item.profile, type);
    const taken = getLeaveTakenForStaff(item.id, type);
    return {
      entitlement,
      taken,
      balance: entitlement === null ? null : Math.max(0, n(entitlement) - taken),
    };
  };

  const claimFormTotal = useMemo(() => (
    claimForm.items.reduce((sum, item) => sum + n(item.amount), 0)
  ), [claimForm.items]);

  const payrollTotals = useMemo(() => {
    const gross = n(payrollForm.basicSalary) + n(payrollForm.overtimeAmount) + n(payrollForm.allowanceAmount) + n(payrollForm.bonusAmount);
    const deductions = n(payrollForm.epfEmployee) + n(payrollForm.socsoEmployee) + n(payrollForm.eisEmployee) + n(payrollForm.taxPcb) + n(payrollForm.unpaidLeaveDeduction) + n(payrollForm.otherDeductions);
    return { gross, deductions, net: Math.max(0, gross - deductions) };
  }, [payrollForm]);

  const companyContributionTotal = useMemo(() => (
    n(payrollForm.epfEmployer) + n(payrollForm.socsoEmployer) + n(payrollForm.eisEmployer) + n(payrollForm.otherContributionAmount)
  ), [payrollForm.eisEmployer, payrollForm.epfEmployer, payrollForm.otherContributionAmount, payrollForm.socsoEmployer]);

  const overtimeTotal = useMemo(() => (
    Number(overtimeEntries.reduce((sum, entry) => sum + (n(entry.hours) * n(overtimeRate) * n(entry.multiplier)), 0).toFixed(2))
  ), [overtimeEntries, overtimeRate]);

  useEffect(() => {
    setPayrollForm(form => n(form.overtimeAmount) === overtimeTotal ? form : { ...form, overtimeAmount: overtimeTotal });
  }, [overtimeTotal]);

  useEffect(() => {
    if (epfEmployeeMode !== 'percentage') return;
    const nextAmount = percentageAmount(payrollForm.basicSalary, epfEmployeePercent);
    setPayrollForm(form => n(form.epfEmployee) === nextAmount ? form : { ...form, epfEmployee: nextAmount });
  }, [epfEmployeeMode, epfEmployeePercent, payrollForm.basicSalary]);

  useEffect(() => {
    if (epfEmployerMode !== 'percentage') return;
    const nextAmount = percentageAmount(payrollForm.basicSalary, epfEmployerPercent);
    setPayrollForm(form => n(form.epfEmployer) === nextAmount ? form : { ...form, epfEmployer: nextAmount });
  }, [epfEmployerMode, epfEmployerPercent, payrollForm.basicSalary]);

  const openStaffModal = (item?: StaffMember) => {
    if (!item) {
      setEditingStaffId(null);
      setStaffForm(blankStaffForm());
      setStaffModalOpen(true);
      return;
    }

    const profile = item.profile;
    setEditingStaffId(item.id);
    setStaffForm({
      username: item.username || '',
      password: '',
      email: item.email || '',
      phone: item.phone || '',
      role: item.role,
      departmentId: profile?.department_id || '',
      fullName: profile?.full_name || '',
      employeeCode: profile?.employee_code || '',
      jobTitle: profile?.job_title || '',
      employmentType: profile?.employment_type || 'Full-time',
      employmentStatus: profile?.employment_status || (item.is_active === false ? 'Inactive' : 'Active'),
      hireDate: profile?.hire_date || new Date().toISOString().split('T')[0],
      icNumber: profile?.ic_number || '',
      nationality: profile?.nationality || '',
      address: profile?.address || '',
      emergencyContactName: profile?.emergency_contact_name || '',
      emergencyContactPhone: profile?.emergency_contact_phone || '',
      bankName: profile?.bank_name || '',
      bankAccountNo: profile?.bank_account_no || '',
      epfNo: profile?.epf_no || '',
      socsoNo: profile?.socso_no || '',
      taxNo: profile?.tax_no || '',
      salaryAmount: n(profile?.salary_amount),
      payFrequency: profile?.pay_frequency || 'Monthly',
      overtimeRate: n(profile?.overtime_rate),
      defaultAllowance: n(profile?.default_allowances?.fixed),
      defaultDeduction: n(profile?.default_deductions?.fixed),
      leaveEntitlements: normalizeLeaveEntitlements(profile?.leave_entitlements),
      notes: profile?.notes || '',
    });
    setStaffModalOpen(true);
  };

  const saveStaff = async () => {
    const username = staffForm.username.trim();
    if (!username || (!editingStaffId && !staffForm.password.trim())) {
      toast(editingStaffId ? 'Username is required' : 'Username and password are required', 'warning');
      return;
    }

    setIsSavingStaff(true);
    try {
      const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
      if (existing && existing.id !== editingStaffId) {
        toast('Username already taken', 'error');
        return;
      }

      const userPayload: Record<string, any> = {
        username,
        role: staffForm.role,
        restaurant_id: restaurant.id,
        email: staffForm.email.trim() || null,
        phone: staffForm.phone.trim() || null,
        is_active: staffForm.employmentStatus !== 'Inactive',
      };
      if (staffForm.password.trim()) userPayload.password = staffForm.password.trim();

      let userId = editingStaffId;
      if (editingStaffId) {
        const { error } = await supabase.from('users').update(userPayload).eq('id', editingStaffId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('users').insert(userPayload).select('id').single();
        if (error) throw error;
        userId = data.id;
      }

      const profilePayload = {
        restaurant_id: restaurant.id,
        user_id: userId,
        department_id: staffForm.departmentId || null,
        employee_code: staffForm.employeeCode.trim() || null,
        full_name: staffForm.fullName.trim() || username,
        ic_number: staffForm.icNumber.trim() || null,
        nationality: staffForm.nationality.trim() || null,
        address: staffForm.address.trim() || null,
        emergency_contact_name: staffForm.emergencyContactName.trim() || null,
        emergency_contact_phone: staffForm.emergencyContactPhone.trim() || null,
        job_title: staffForm.jobTitle.trim() || null,
        employment_type: staffForm.employmentType,
        employment_status: staffForm.employmentStatus,
        hire_date: staffForm.hireDate || null,
        bank_name: staffForm.bankName.trim() || null,
        bank_account_no: staffForm.bankAccountNo.trim() || null,
        epf_no: staffForm.epfNo.trim() || null,
        socso_no: staffForm.socsoNo.trim() || null,
        tax_no: staffForm.taxNo.trim() || null,
        salary_amount: n(staffForm.salaryAmount),
        pay_frequency: staffForm.payFrequency,
        overtime_rate: n(staffForm.overtimeRate),
        default_allowances: { fixed: n(staffForm.defaultAllowance) },
        default_deductions: { fixed: n(staffForm.defaultDeduction) },
        leave_entitlements: normalizeLeaveEntitlements(staffForm.leaveEntitlements),
        notes: staffForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error: profileError } = await supabase.from('staff_profiles').upsert(profilePayload, { onConflict: 'user_id' });
      if (profileError) throw profileError;

      setStaffModalOpen(false);
      setEditingStaffId(null);
      await refresh(false);
      toast(editingStaffId ? 'Staff updated' : 'Staff added', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save staff', 'error');
    } finally {
      setIsSavingStaff(false);
    }
  };

  const updateStaffStatus = async (item: StaffMember, status: StaffEmploymentStatus) => {
    const statusKey = `staff_${item.id}`;
    const nextActive = status !== 'Inactive' && status !== 'Resigned';
    setUpdatingStatusId(statusKey);
    try {
      const { error: userError } = await supabase.from('users').update({ is_active: nextActive }).eq('id', item.id);
      if (userError) throw userError;

      const { error: profileError } = await supabase
        .from('staff_profiles')
        .update({ employment_status: status, updated_at: new Date().toISOString() })
        .eq('user_id', item.id);
      if (profileError) throw profileError;

      cacheStaff(staff.map(staffItem => staffItem.id === item.id ? {
        ...staffItem,
        is_active: nextActive,
        profile: staffItem.profile ? { ...staffItem.profile, employment_status: status } : staffItem.profile,
      } : staffItem));
      toast(`${item.username} status updated`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to update staff status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const updatePayslipStatus = async (payslip: PayrollPayslip, status: PayrollPayslip['status']) => {
    const statusKey = `payslip_${payslip.id}`;
    setUpdatingStatusId(statusKey);
    try {
      const { error } = await supabase
        .from('payroll_payslips')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', payslip.id);
      if (error) throw error;

      setPayslips(items => items.map(item => item.id === payslip.id ? { ...item, status } : item));
      toast('Payslip status updated', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to update payslip status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const updateDepartmentStatus = async (department: StaffDepartment, isActive: boolean) => {
    const statusKey = `department_${department.id}`;
    setUpdatingStatusId(statusKey);
    try {
      const { error } = await supabase
        .from('staff_departments')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', department.id);
      if (error) throw error;

      setDepartments(items => items.map(item => item.id === department.id ? { ...item, is_active: isActive } : item));
      toast('Department status updated', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to update department status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const deleteStaff = async (item: StaffMember) => {
    if (!confirm(`Remove ${item.username}? This will remove the login, HR profile and saved payslips.`)) return;
    await supabase.from('payroll_payslips').delete().eq('staff_user_id', item.id);
    await supabase.from('staff_leaves').delete().eq('staff_user_id', item.id);
    await supabase.from('staff_profiles').delete().eq('user_id', item.id);
    const { error } = await supabase.from('users').delete().eq('id', item.id);
    if (error) {
      toast(error.message || 'Failed to remove staff', 'error');
      return;
    }
    cacheStaff(staff.filter(staffItem => staffItem.id !== item.id));
    await refresh(false);
    toast('Staff removed', 'success');
  };

  const addDepartment = async () => {
    if (!departmentName.trim()) {
      toast('Department name is required', 'warning');
      return;
    }
    const { error } = await supabase.from('staff_departments').insert({
      restaurant_id: restaurant.id,
      name: departmentName.trim(),
      code: departmentCode.trim() || null,
      is_active: true,
    });
    if (error) {
      toast(error.message || 'Failed to add department', 'error');
      return;
    }
    setDepartmentName('');
    setDepartmentCode('');
    await refresh(false);
    toast('Department added', 'success');
  };

  const resetEpfContributionModes = () => {
    setEpfEmployeeMode('percentage');
    setEpfEmployeePercent(11);
    setEpfEmployerMode('percentage');
    setEpfEmployerPercent(13);
  };

  const applyPayrollTemplate = (item: StaffMember) => {
    const salary = n(item.profile?.salary_amount);
    const allowance = n(item.profile?.default_allowances?.fixed);
    const deduction = n(item.profile?.default_deductions?.fixed);
    resetEpfContributionModes();
    setOvertimeRate(n(item.profile?.overtime_rate));
    setOvertimeEntries([blankOvertimeEntry()]);
    setIsOvertimeOpen(false);
    setPayrollForm(prev => ({
      ...prev,
      staffUserId: item.id,
      basicSalary: salary,
      allowanceAmount: allowance,
      otherDeductions: deduction,
      epfEmployee: percentageAmount(salary, 11),
      epfEmployer: percentageAmount(salary, 13),
      socsoEmployee: Number((salary * 0.005).toFixed(2)),
      eisEmployee: Number((salary * 0.002).toFixed(2)),
      socsoEmployer: Number((salary * 0.0175).toFixed(2)),
      eisEmployer: Number((salary * 0.002).toFixed(2)),
    }));
  };

  const openPayslipForm = (item?: StaffMember) => {
    setEditingPayslipId(null);
    setPayrollForm(blankPayrollForm());
    resetEpfContributionModes();
    setOvertimeRate(0);
    setOvertimeEntries([blankOvertimeEntry()]);
    setIsOvertimeOpen(false);
    if (item) applyPayrollTemplate(item);
    setIsPayslipFormOpen(true);
  };

  const hydratePayrollFormFromPayslip = (payslip: PayrollPayslip, mode: 'edit' | 'copy') => {
    const item = staff.find(staffItem => staffItem.id === payslip.staff_user_id);
    const copiedOvertime = n(payslip.overtime_amount);

    setEpfEmployeeMode('fixed');
    setEpfEmployerMode('fixed');
    setEpfEmployeePercent(11);
    setEpfEmployerPercent(13);
    setOvertimeRate(copiedOvertime > 0 ? copiedOvertime : n(item?.profile?.overtime_rate));
    setOvertimeEntries(copiedOvertime > 0 ? [{ id: crypto.randomUUID(), hours: 1, multiplier: 1 }] : [blankOvertimeEntry()]);
    setIsOvertimeOpen(copiedOvertime > 0);
    setPayrollForm({
      staffUserId: payslip.staff_user_id,
      payPeriod: mode === 'copy' ? monthLabel() : payslip.pay_period,
      payDate: payslip.pay_date,
      basicSalary: n(payslip.basic_salary),
      overtimeAmount: copiedOvertime,
      allowanceAmount: n(payslip.allowance_amount),
      bonusAmount: n(payslip.bonus_amount),
      epfEmployee: n(payslip.epf_employee),
      epfEmployer: n(payslip.epf_employer),
      socsoEmployee: n(payslip.socso_employee),
      eisEmployee: n(payslip.eis_employee),
      socsoEmployer: n(payslip.socso_employer),
      eisEmployer: n(payslip.eis_employer),
      taxPcb: n(payslip.tax_pcb),
      unpaidLeaveDeduction: n(payslip.unpaid_leave_deduction),
      otherDeductionName: payslip.other_deduction_name || 'Other Deductions',
      otherDeductions: n(payslip.other_deductions),
      otherContributionName: payslip.other_contribution_name || 'Other Contribution',
      otherContributionAmount: n(payslip.other_contribution_amount),
      paymentMethod: payslip.payment_method || 'Bank Transfer',
      status: payslip.status || 'draft',
      notes: payslip.notes || '',
    });
    setPreviewPayslip(null);
    setIsPayslipFormOpen(true);
  };

  const editPayslip = (payslip: PayrollPayslip) => {
    setEditingPayslipId(payslip.id);
    hydratePayrollFormFromPayslip(payslip, 'edit');
  };

  const copyPayslip = (payslip: PayrollPayslip) => {
    setEditingPayslipId(null);
    hydratePayrollFormFromPayslip(payslip, 'copy');
    toast('Payslip copied. Update the pay period and save as a new payslip.', 'success');
  };

  const reviewPayslip = () => {
    const selectedStaff = staff.find(item => item.id === payrollForm.staffUserId);
    if (!selectedStaff) {
      toast('Select a staff member first', 'warning');
      return;
    }

    setPreviewPayslip({
      id: `preview_${selectedStaff.id}`,
      restaurant_id: restaurant.id,
      staff_user_id: selectedStaff.id,
      staff_profile_id: selectedStaff.profile?.id || null,
      pay_period: payrollForm.payPeriod,
      pay_date: payrollForm.payDate,
      basic_salary: n(payrollForm.basicSalary),
      overtime_amount: n(payrollForm.overtimeAmount),
      allowance_amount: n(payrollForm.allowanceAmount),
      bonus_amount: n(payrollForm.bonusAmount),
      gross_pay: payrollTotals.gross,
      epf_employee: n(payrollForm.epfEmployee),
      epf_employer: n(payrollForm.epfEmployer),
      socso_employee: n(payrollForm.socsoEmployee),
      eis_employee: n(payrollForm.eisEmployee),
      socso_employer: n(payrollForm.socsoEmployer),
      eis_employer: n(payrollForm.eisEmployer),
      tax_pcb: n(payrollForm.taxPcb),
      unpaid_leave_deduction: n(payrollForm.unpaidLeaveDeduction),
      other_deductions: n(payrollForm.otherDeductions),
      other_deduction_name: payrollForm.otherDeductionName.trim() || 'Other Deductions',
      other_contribution_name: payrollForm.otherContributionName.trim() || 'Other Contribution',
      other_contribution_amount: n(payrollForm.otherContributionAmount),
      net_pay: payrollTotals.net,
      payment_method: payrollForm.paymentMethod,
      status: payrollForm.status,
      notes: payrollForm.notes.trim() || null,
    });
  };

  const savePayslip = async () => {
    const selectedStaff = staff.find(item => item.id === payrollForm.staffUserId);
    if (!selectedStaff) {
      toast('Select a staff member first', 'warning');
      return;
    }
    if (payrollTotals.net <= 0) {
      toast('Net pay must be more than zero', 'warning');
      return;
    }

    setIsSavingPayslip(true);
    try {
      const id = editingPayslipId || crypto.randomUUID();
      const row: PayrollPayslip = {
        id,
        restaurant_id: restaurant.id,
        staff_user_id: selectedStaff.id,
        staff_profile_id: selectedStaff.profile?.id || null,
        pay_period: payrollForm.payPeriod,
        pay_date: payrollForm.payDate,
        basic_salary: n(payrollForm.basicSalary),
        overtime_amount: n(payrollForm.overtimeAmount),
        allowance_amount: n(payrollForm.allowanceAmount),
        bonus_amount: n(payrollForm.bonusAmount),
        gross_pay: payrollTotals.gross,
        epf_employee: n(payrollForm.epfEmployee),
        epf_employer: n(payrollForm.epfEmployer),
        socso_employee: n(payrollForm.socsoEmployee),
        eis_employee: n(payrollForm.eisEmployee),
        socso_employer: n(payrollForm.socsoEmployer),
        eis_employer: n(payrollForm.eisEmployer),
        tax_pcb: n(payrollForm.taxPcb),
        unpaid_leave_deduction: n(payrollForm.unpaidLeaveDeduction),
        other_deductions: n(payrollForm.otherDeductions),
        other_deduction_name: payrollForm.otherDeductionName.trim() || 'Other Deductions',
        other_contribution_name: payrollForm.otherContributionName.trim() || 'Other Contribution',
        other_contribution_amount: n(payrollForm.otherContributionAmount),
        net_pay: payrollTotals.net,
        payment_method: payrollForm.paymentMethod,
        status: payrollForm.status,
        notes: payrollForm.notes.trim() || null,
      };

      const payload = { ...row, updated_at: new Date().toISOString() };
      const { error } = editingPayslipId
        ? await supabase.from('payroll_payslips').update(payload).eq('id', editingPayslipId)
        : await supabase.from('payroll_payslips').insert(payload);
      if (error) throw error;

      await supabase.from('expenses').upsert({
        id: `payroll_${id}`,
        restaurant_id: restaurant.id,
        date: payrollForm.payDate,
        amount: payrollTotals.net,
        category: 'Staff',
        subcategory: 'Salary',
        payment_method: payrollForm.paymentMethod,
        notes: `Payroll ${payrollForm.payPeriod} - ${selectedStaff.profile?.full_name || selectedStaff.username}`,
        type: 'OPEX',
        staff_name: selectedStaff.profile?.full_name || selectedStaff.username,
        staff_role: selectedStaff.role,
        basic_salary: n(payrollForm.basicSalary),
        allowances: n(payrollForm.allowanceAmount) + n(payrollForm.bonusAmount) + n(payrollForm.overtimeAmount),
        deductions: payrollTotals.deductions,
        pay_period: payrollForm.payPeriod,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      setPayrollForm(blankPayrollForm());
      setEditingPayslipId(null);
      setIsPayslipFormOpen(false);
      setPreviewPayslip(row);
      await refresh(false);
      toast(editingPayslipId ? 'Payslip updated and synced to expenses' : 'Payslip saved and synced to expenses', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save payslip', 'error');
    } finally {
      setIsSavingPayslip(false);
    }
  };

  const openClaimForm = (item?: StaffMember) => {
    setEditingClaimId(null);
    setClaimForm({
      ...blankClaimForm(),
      staffUserId: item?.id || '',
    });
    setIsClaimFormOpen(true);
  };

  const editClaim = (claim: StaffClaim) => {
    setEditingClaimId(claim.id);
    setClaimForm({
      staffUserId: claim.staff_user_id || '',
      claimDate: claim.claim_date,
      claimPeriod: claim.claim_period || monthLabel(),
      paymentMethod: claim.payment_method || 'Bank Transfer',
      status: claim.status || 'draft',
      notes: claim.notes || '',
      items: claim.items.length ? claim.items.map(item => ({
        id: item.id || crypto.randomUUID(),
        claimType: claimTypes.includes(item.claim_type) ? item.claim_type : 'Other',
        amount: n(item.amount),
        receiptRef: item.receipt_ref || '',
        notes: item.notes || '',
      })) : [blankClaimLine()],
    });
    setIsClaimFormOpen(true);
  };

  const saveClaim = async () => {
    const selectedStaff = staff.find(item => item.id === claimForm.staffUserId);
    if (!selectedStaff) {
      toast('Select a staff member first', 'warning');
      return;
    }
    const validItems = claimForm.items
      .map(item => ({
        ...item,
        claimType: item.claimType || 'Other',
        amount: n(item.amount),
        receiptRef: item.receiptRef.trim(),
        notes: item.notes.trim(),
      }))
      .filter(item => item.amount > 0);
    const totalAmount = validItems.reduce((sum, item) => sum + item.amount, 0);
    if (totalAmount <= 0) {
      toast('Claim amount must be more than zero', 'warning');
      return;
    }

    setIsSavingClaim(true);
    try {
      const id = editingClaimId || crypto.randomUUID();
      const staffName = selectedStaff.profile?.full_name || selectedStaff.username;
      const claimSummary = validItems.length === 1 ? validItems[0].claimType : `${validItems[0].claimType} + ${validItems.length - 1}`;
      const { error } = await supabase.from('staff_claims').upsert({
        id,
        restaurant_id: restaurant.id,
        staff_user_id: selectedStaff.id,
        staff_profile_id: selectedStaff.profile?.id || null,
        claim_period: claimForm.claimPeriod,
        claim_date: claimForm.claimDate,
        total_amount: totalAmount,
        payment_method: claimForm.paymentMethod,
        status: claimForm.status,
        notes: claimForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;

      if (editingClaimId) {
        const { error: deleteItemsError } = await supabase.from('staff_claim_items').delete().eq('claim_id', id);
        if (deleteItemsError) throw deleteItemsError;
      }

      const { error: itemError } = await supabase.from('staff_claim_items').insert(validItems.map(item => ({
        claim_id: id,
        claim_type: item.claimType,
        amount: item.amount,
        receipt_ref: item.receiptRef || null,
        notes: item.notes || null,
      })));
      if (itemError) throw itemError;

      const { error: expenseError } = await supabase.from('expenses').upsert({
        id: `claim_${id}`,
        restaurant_id: restaurant.id,
        date: claimForm.claimDate,
        amount: totalAmount,
        category: 'Staff',
        subcategory: 'Claims',
        supplier_id: null,
        supplier_name: claimSummary,
        payment_method: claimForm.paymentMethod,
        notes: claimForm.notes.trim() || `${claimSummary} claim - ${staffName}`,
        attachment_name: validItems.map(item => item.receiptRef).filter(Boolean).join(', ') || null,
        type: 'OPEX',
        staff_name: staffName,
        staff_role: selectedStaff.role,
        basic_salary: null,
        allowances: totalAmount,
        deductions: null,
        pay_period: claimForm.claimPeriod.trim() || monthLabel(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (expenseError) throw expenseError;

      setClaimForm(blankClaimForm());
      setEditingClaimId(null);
      setIsClaimFormOpen(false);
      await refresh(false);
      toast(editingClaimId ? 'Staff claim updated and synced to expenses' : 'Staff claim saved and synced to expenses', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to save staff claim', 'error');
    } finally {
      setIsSavingClaim(false);
    }
  };

  const deleteClaim = async (claim: StaffClaim) => {
    if (!confirm(`Delete this claim for ${claim.staff_name || 'staff'}?`)) return;
    const { error } = await supabase.from('staff_claims').delete().eq('id', claim.id);
    if (error) {
      toast(error.message || 'Failed to delete staff claim', 'error');
      return;
    }
    await supabase.from('expenses').delete().eq('id', `claim_${claim.id}`);
    setStaffClaims(items => items.filter(item => item.id !== claim.id));
    toast('Staff claim deleted', 'success');
  };

  const openLeaveForm = (item?: StaffMember) => {
    setEditingLeaveId(null);
    setLeaveForm({
      ...blankLeaveForm(),
      staffUserId: item?.id || '',
    });
    setIsLeaveFormOpen(true);
  };

  const editLeave = (leave: StaffLeave) => {
    setEditingLeaveId(leave.id);
    setLeaveForm({
      staffUserId: leave.staff_user_id,
      leaveType: leave.leave_type,
      startDate: leave.start_date,
      endDate: leave.end_date,
      totalDays: n(leave.total_days) || inclusiveLeaveDays(leave.start_date, leave.end_date),
      status: leave.status || 'scheduled',
      notes: leave.notes || '',
    });
    setIsLeaveFormOpen(true);
  };

  const updateLeaveStatus = async (leave: StaffLeave, status: LeaveStatus) => {
    const statusKey = `leave_${leave.id}`;
    setUpdatingStatusId(statusKey);
    try {
      const { error } = await supabase
        .from('staff_leaves')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', leave.id);
      if (error) throw error;

      setStaffLeaves(items => items.map(item => item.id === leave.id ? { ...item, status } : item));
      toast('Leave status updated', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to update leave status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const saveLeave = async () => {
    const selectedStaff = staff.find(item => item.id === leaveForm.staffUserId);
    if (!selectedStaff) {
      toast('Select a staff member first', 'warning');
      return;
    }
    if (dateOnlyTime(leaveForm.endDate) < dateOnlyTime(leaveForm.startDate)) {
      toast('Leave end date must be after the start date', 'warning');
      return;
    }

    setIsSavingLeave(true);
    try {
      const id = editingLeaveId || crypto.randomUUID();
      const row: StaffLeave = {
        id,
        restaurant_id: restaurant.id,
        staff_user_id: selectedStaff.id,
        staff_profile_id: selectedStaff.profile?.id || null,
        leave_type: leaveForm.leaveType,
        start_date: leaveForm.startDate,
        end_date: leaveForm.endDate,
        total_days: n(leaveForm.totalDays) || inclusiveLeaveDays(leaveForm.startDate, leaveForm.endDate),
        status: leaveForm.status,
        notes: leaveForm.notes.trim() || null,
      };

      const { error } = await supabase.from('staff_leaves').upsert({
        ...row,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;

      setLeaveForm(blankLeaveForm());
      setEditingLeaveId(null);
      setIsLeaveFormOpen(false);
      await refresh(false);
      toast(editingLeaveId ? 'Leave updated' : 'Leave added', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to save leave', 'error');
    } finally {
      setIsSavingLeave(false);
    }
  };

  const deleteLeave = async (leave: StaffLeave) => {
    if (!confirm(`Delete ${leave.leave_type} leave for ${leave.staff_name || 'staff'}?`)) return;
    const { error } = await supabase.from('staff_leaves').delete().eq('id', leave.id);
    if (error) {
      toast(error.message || 'Failed to delete leave', 'error');
      return;
    }
    setStaffLeaves(items => items.filter(item => item.id !== leave.id));
    toast('Leave deleted', 'success');
  };

  const buildPayslipPdf = async (payslip: PayrollPayslip) => {
    const selectedStaff = staff.find(item => item.id === payslip.staff_user_id);
    const selectedDepartment = departments.find(dept => dept.id === selectedStaff?.profile?.department_id);
    const fullName = selectedStaff?.profile?.full_name || selectedStaff?.username || 'Staff';
    const periodLabel = payslip.pay_period?.trim() || new Date(payslip.pay_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const payDateLabel = new Date(payslip.pay_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const deductionsTotal =
      n(payslip.epf_employee) +
      n(payslip.socso_employee) +
      n(payslip.eis_employee) +
      n(payslip.tax_pcb) +
      n(payslip.unpaid_leave_deduction) +
      n(payslip.other_deductions);
    const employerContributionTotal =
      n(payslip.epf_employer) +
      n(payslip.socso_employer) +
      n(payslip.eis_employer) +
      n(payslip.other_contribution_amount);

    const receiptSettings = (restaurant.settings?.receipt || {}) as Record<string, unknown>;
    const companyName = String(receiptSettings.businessName || restaurant.name || 'Company');
    const companyAddressLine1 = String(receiptSettings.businessAddressLine1 || '').trim();
    const companyAddressLine2 = String(receiptSettings.businessAddressLine2 || '').trim();
    const companyPhone = String(receiptSettings.businessPhone || '').trim();
    const companyLines = [
      companyName,
      companyAddressLine1 || restaurant.location || '',
      companyAddressLine2,
      companyPhone ? `Phone: ${companyPhone}` : '',
    ].filter(Boolean);

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    const accent = [217, 119, 6] as [number, number, number];
    const textColor = [31, 41, 55] as [number, number, number];
    let y = 14;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(...textColor);
      doc.text('PAYSLIP', margin, y);
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(`Pay Period: ${periodLabel}`, pageWidth - margin, y, { align: 'right' });
      y += 7;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...textColor);
      doc.text(companyLines[0] || restaurant.name, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      companyLines.slice(1).forEach((line) => {
        const lines = doc.splitTextToSize(line, contentWidth * 0.6);
        doc.text(lines, margin, y);
        y += 4;
      });

      doc.setDrawColor(...accent);
      doc.setLineWidth(0.6);
      doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
      y += 7;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.6, textColor: textColor },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
        body: [
          ['Employee Name', fullName, 'Pay Date', payDateLabel],
          ['Employee ID', selectedStaff?.profile?.employee_code || selectedStaff?.id || '-', 'Department', selectedDepartment?.name || 'Unassigned'],
          ['Job Title', selectedStaff?.profile?.job_title || selectedStaff?.role || '-', 'Payment Method', payslip.payment_method || '-'],
          ['EPF No.', selectedStaff?.profile?.epf_no || '-', 'SOCSO No.', selectedStaff?.profile?.socso_no || '-'],
          ['Tax No.', selectedStaff?.profile?.tax_no || '-', 'Bank Account', selectedStaff?.profile?.bank_account_no || '-'],
          ['Status', (payslip.status || 'draft').toUpperCase(), 'Generated On', new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })],
        ],
      });

      const earningsStartY = (doc as any).lastAutoTable.finalY + 6;

      autoTable(doc, {
        startY: earningsStartY,
        margin: { left: margin, right: pageWidth / 2 + 2 },
        head: [['Earnings', 'Amount']],
        body: [
          ['Basic Salary', fmt(payslip.basic_salary)],
          ['Overtime', fmt(payslip.overtime_amount)],
          ['Allowance', fmt(payslip.allowance_amount)],
          ['Bonus', fmt(payslip.bonus_amount)],
          ['Gross Pay', fmt(payslip.gross_pay)],
        ],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.4, textColor: textColor },
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      });

      const earningsFinalY = (doc as any).lastAutoTable.finalY;

      autoTable(doc, {
        startY: earningsStartY,
        margin: { left: pageWidth / 2 + 2, right: margin },
        head: [['Deductions', 'Amount']],
        body: [
          ['EPF Employee', fmt(payslip.epf_employee)],
          ['SOCSO Employee', fmt(payslip.socso_employee)],
          ['EIS Employee', fmt(payslip.eis_employee)],
          ['PCB / Tax', fmt(payslip.tax_pcb)],
          ['Unpaid Leave', fmt(payslip.unpaid_leave_deduction)],
          [payslip.other_deduction_name || 'Other Deductions', fmt(payslip.other_deductions)],
          ['Total Deductions', fmt(deductionsTotal)],
        ],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.4, textColor: textColor },
        headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold' },
      });

      const deductionsFinalY = (doc as any).lastAutoTable.finalY;

      autoTable(doc, {
        startY: Math.max(earningsFinalY, deductionsFinalY) + 6,
        margin: { left: margin, right: margin },
        head: [['Employer Contribution', 'Amount']],
        body: [
          ['EPF Employer', fmt(payslip.epf_employer)],
          ['SOCSO Employer', fmt(n(payslip.socso_employer))],
          ['EIS Employer', fmt(n(payslip.eis_employer))],
          [payslip.other_contribution_name || 'Other Contribution', fmt(n(payslip.other_contribution_amount))],
          ['Total Company Contribution', fmt(employerContributionTotal)],
        ],
        theme: 'grid',
        styles: { fontSize: 8.3, cellPadding: 2.4, textColor: textColor },
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      });

      const summaryY = (doc as any).lastAutoTable.finalY + 7;
      doc.setFillColor(255, 247, 237);
      doc.setDrawColor(...accent);
      doc.roundedRect(margin, summaryY, contentWidth, 16, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text('NET PAY', margin + 4, summaryY + 6);
      doc.setFontSize(16);
      doc.setTextColor(...textColor);
      doc.text(fmt(payslip.net_pay), pageWidth - margin - 4, summaryY + 10.5, { align: 'right' });

      if (payslip.notes) {
        const noteY = summaryY + 22;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Notes', margin, noteY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        const notes = doc.splitTextToSize(String(payslip.notes), contentWidth);
        doc.text(notes, margin, noteY + 4);
      }

    const safeName = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'staff';
    const safePeriod = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'period';
    return { doc, safeName, safePeriod };
  };

  const downloadPayslipPdf = async (payslip: PayrollPayslip) => {
    try {
      const { doc, safeName, safePeriod } = await buildPayslipPdf(payslip);
      doc.save(`payslip-${safeName}-${safePeriod}.pdf`);
      toast('Payslip PDF downloaded.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to download payslip PDF', 'error');
    }
  };

  const printPayslipPdf = async (payslip: PayrollPayslip) => {
    try {
      const { doc } = await buildPayslipPdf(payslip);
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(blobUrl, '_blank');
      if (!printWindow) {
        URL.revokeObjectURL(blobUrl);
        toast('Please allow pop-ups to print payslip PDF.', 'warning');
        return;
      }
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_error) {
          // Some browsers block auto-print for embedded PDF viewers.
        }
      }, 800);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: any) {
      toast(err?.message || 'Failed to print payslip PDF', 'error');
    }
  };

  const selectedDetailStaff = staffDetailId ? staff.find(item => item.id === staffDetailId) || null : null;
  const selectedPreviewStaff = previewPayslip ? staff.find(item => item.id === previewPayslip.staff_user_id) : null;
  const renderModalPortal = (node: React.ReactNode) => (typeof document === 'undefined' ? node : createPortal(node, document.body));

  const fieldClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400';
  const renderPeriodPicker = (label: string, value: string, onChange: (value: string) => void) => {
    const period = parsePeriodLabel(value);
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <div className="grid grid-cols-[1fr_112px] gap-2">
          <select value={period.month} onChange={event => onChange(periodLabelFromParts(event.target.value, period.year))} className={fieldClass}>
            {periodMonths.map(month => <option key={month} value={month}>{month}</option>)}
          </select>
          <select value={period.year} onChange={event => onChange(periodLabelFromParts(period.month, event.target.value))} className={fieldClass}>
            {periodYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
    );
  };
  const updateLeaveEntitlementType = (type: LeaveType, patch: Partial<LeaveEntitlementRule>) => {
    setStaffForm(form => {
      const entitlements = normalizeLeaveEntitlements(form.leaveEntitlements);
      return {
        ...form,
        leaveEntitlements: {
          ...entitlements,
          types: {
            ...entitlements.types,
            [type]: { ...entitlements.types[type], ...patch },
          },
        },
      };
    });
  };
  const updateAnnualLeaveLevel = (id: string, patch: Partial<AnnualLeaveLevel>) => {
    setStaffForm(form => {
      const entitlements = normalizeLeaveEntitlements(form.leaveEntitlements);
      return {
        ...form,
        leaveEntitlements: {
          ...entitlements,
          annualLevels: entitlements.annualLevels.map(level => level.id === id ? { ...level, ...patch } : level),
        },
      };
    });
  };
  const updateLeaveEntitlements = (patch: Partial<StaffLeaveEntitlements>) => {
    setStaffForm(form => ({ ...form, leaveEntitlements: { ...normalizeLeaveEntitlements(form.leaveEntitlements), ...patch } }));
  };
  const renderFloatingActionMenu = () => {
    if (!floatingActionMenu) return null;

    const closeMenu = () => setFloatingActionMenu(null);
    const menuStaff = floatingActionMenu.type === 'staff' ? staff.find(item => item.id === floatingActionMenu.id) : null;
    const menuPayslip = floatingActionMenu.type === 'payslip' ? payslips.find(item => item.id === floatingActionMenu.id) : null;
    const menuClaim = floatingActionMenu.type === 'claim' ? staffClaims.find(item => item.id === floatingActionMenu.id) : null;
    const menuLeave = floatingActionMenu.type === 'leave' ? staffLeaves.find(item => item.id === floatingActionMenu.id) : null;
    const itemClass = 'flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white';

    return renderModalPortal(
      <>
        <button type="button" aria-label="Close actions" className="fixed inset-0 z-[100000] cursor-default" onClick={closeMenu} />
        <div
          className="fixed z-[100001] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-left shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ top: floatingActionMenu.top, left: floatingActionMenu.left, width: floatingActionMenu.width }}
        >
          {floatingActionMenu.type === 'staff' && menuStaff && (
            <>
              <button type="button" onClick={() => { closeMenu(); openStaffDetail(menuStaff); }} className={itemClass}>
                <Eye size={14} /> View Details
              </button>
              <button type="button" onClick={() => { closeMenu(); openStaffModal(menuStaff); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-amber-50 hover:text-amber-700 dark:text-gray-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-300">
                <Edit3 size={14} /> Edit Profile
              </button>
              <button type="button" onClick={() => { closeMenu(); setSubTab('payroll'); openPayslipForm(menuStaff); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-gray-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300">
                <Receipt size={14} /> Make a Payslip
              </button>
              <button type="button" onClick={() => { closeMenu(); setSubTab('claims'); openClaimForm(menuStaff); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-sky-50 hover:text-sky-700 dark:text-gray-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-300">
                <FileText size={14} /> Create Claim
              </button>
              <button type="button" onClick={() => { closeMenu(); setSubTab('leave'); openLeaveForm(menuStaff); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-violet-50 hover:text-violet-700 dark:text-gray-200 dark:hover:bg-violet-900/20 dark:hover:text-violet-300">
                <CalendarPlus size={14} /> Add Leave
              </button>
              <button type="button" onClick={() => { closeMenu(); deleteStaff(menuStaff); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20">
                <Trash2 size={14} /> Remove
              </button>
            </>
          )}
          {floatingActionMenu.type === 'payslip' && menuPayslip && (
            <>
              <button type="button" onClick={() => { closeMenu(); editPayslip(menuPayslip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-amber-50 hover:text-amber-700 dark:text-gray-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-300">
                <Edit3 size={14} /> Edit Payslip
              </button>
              <button type="button" onClick={() => { closeMenu(); void downloadPayslipPdf(menuPayslip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-sky-50 hover:text-sky-700 dark:text-gray-200 dark:hover:bg-sky-900/20 dark:hover:text-sky-300">
                <Download size={14} /> Download PDF
              </button>
              <button type="button" onClick={() => { closeMenu(); setPreviewPayslip(menuPayslip); }} className={itemClass}>
                <Eye size={14} /> View Payslip
              </button>
              <button type="button" onClick={() => { closeMenu(); copyPayslip(menuPayslip); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-gray-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300">
                <Copy size={14} /> Copy Payslip
              </button>
            </>
          )}
          {floatingActionMenu.type === 'claim' && menuClaim && (
            <>
              <button type="button" onClick={() => { closeMenu(); editClaim(menuClaim); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-amber-50 hover:text-amber-700 dark:text-gray-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-300">
                <Edit3 size={14} /> Edit Claim
              </button>
              <button type="button" onClick={() => { closeMenu(); deleteClaim(menuClaim); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20">
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
          {floatingActionMenu.type === 'leave' && menuLeave && (
            <>
              <button type="button" onClick={() => { closeMenu(); editLeave(menuLeave); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-amber-50 hover:text-amber-700 dark:text-gray-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-300">
                <Edit3 size={14} /> Edit Leave
              </button>
              <button type="button" onClick={() => { closeMenu(); deleteLeave(menuLeave); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20">
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>
      </>,
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">Back Office HR</p>
            <h2 className="mt-1 text-2xl font-black text-gray-950 dark:text-white">Staff Management & Payroll</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Manage staff login accounts, departments, employee details, salary profiles, statutory deductions and payslips.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => refresh(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 transition hover:border-amber-300 hover:text-amber-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <RotateCcw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,1.15fr)_minmax(420px,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10"><CalendarDays size={20} className="text-violet-500" /></div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">People On Leave</span>
                <p className="text-2xl font-black text-gray-950 dark:text-white">{peopleOnLeaveToday.length}</p>
              </div>
            </div>
            <button onClick={() => { setSubTab('leave'); openLeaveForm(); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-violet-700">
              <CalendarPlus size={13} /> Add
            </button>
          </div>
          {peopleOnLeaveToday.length ? (
            <div className="space-y-2">
              {peopleOnLeaveToday.slice(0, 4).map(leave => (
                <div key={leave.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-gray-900 dark:text-white">{leave.staff_name || 'Staff'}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{leave.leave_type} - {n(leave.total_days)} day{n(leave.total_days) === 1 ? '' : 's'}</p>
                  </div>
                  <span className="rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">{leave.status}</span>
                </div>
              ))}
              {peopleOnLeaveToday.length > 4 && <p className="text-[11px] font-bold text-gray-400">+{peopleOnLeaveToday.length - 4} more on leave today</p>}
            </div>
          ) : (
            <div className="flex min-h-32 flex-col justify-center rounded-xl border border-dashed border-gray-200 px-4 text-gray-400 dark:border-gray-700">
              <p className="text-sm font-bold">No one is on leave today</p>
              <p className="mt-1 text-xs">Approved and scheduled leave for today will appear here.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: 'Total Staff', value: staff.length, icon: <Users size={20} className="text-blue-500" />, tone: 'bg-blue-500/10' },
            { label: 'Departments', value: departments.length, icon: <Building2 size={20} className="text-amber-500" />, tone: 'bg-amber-500/10' },
            { label: 'Monthly Payroll', value: fmt(staff.reduce((sum, item) => sum + n(item.profile?.salary_amount), 0)), icon: <CreditCard size={20} className="text-emerald-500" />, tone: 'bg-emerald-500/10' },
            { label: 'Payslips', value: payslips.length, icon: <FileText size={20} className="text-rose-500" />, tone: 'bg-rose-500/10' },
          ].map(card => (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-3 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>{card.icon}</div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{card.label}</span>
              </div>
              <p className="text-2xl font-black text-gray-950 dark:text-white">{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <div className="relative flex gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['directory', 'Staff Directory', <Users size={14} />],
            ['leave', 'Leave', <CalendarDays size={14} />],
            ['payroll', 'Staff Payslip', <Receipt size={14} />],
            ['claims', 'Staff Claim', <FileText size={14} />],
            ['departments', 'Departments', <Building2 size={14} />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
              className={`relative -mb-px inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg border px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-150 ${
                subTab === key
                  ? 'z-10 border-x border-t border-gray-200 bg-white text-orange-500 dark:border-gray-600 dark:border-t-orange-500 dark:bg-gray-800'
                  : 'border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {subTab === 'directory' && (
        <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Employee Records</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Login credentials are linked to employee profiles, departments and salary setup.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff..." className="h-[38px] w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>
              <button onClick={() => openStaffModal()} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                <UserPlus size={14} /> Add Staff
              </button>
            </div>
          </div>
          {visibleStaff.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="w-[34%] min-w-[260px] px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Staff</th>
                    <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Department</th>
                    <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Login Role</th>
                    <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Contact</th>
                    <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                    <th className="w-12 px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {visibleStaff.map(item => {
                    const department = departments.find(dept => dept.id === item.profile?.department_id);
                    const currentStatus = (item.profile?.employment_status || (item.is_active === false ? 'Inactive' : 'Active')) as StaffEmploymentStatus;
                    return (
                      <tr key={item.id} className="transition">
                        <td className="w-[34%] min-w-[260px] px-5 py-4">
                          <div>
                            <button type="button" onClick={() => openStaffDetail(item)} className="text-left text-sm font-black text-gray-900 transition hover:text-amber-600 hover:underline dark:text-white dark:hover:text-amber-300">
                              {item.profile?.full_name || item.username}
                            </button>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.profile?.employee_code || item.username}</p>
                            {item.profile?.nationality && <p className="mt-1 text-[10px] font-semibold text-gray-400">Citizen: {item.profile.nationality}</p>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{department?.name || 'Unassigned'}</p><p>{item.profile?.job_title || 'No job title'}</p></td>
                        <td className="px-5 py-4"><span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-700 dark:text-gray-300">{item.role}</span></td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p>{item.email || '-'}</p><p>{item.phone || '-'}</p></td>
                        <td className="px-5 py-4">
                          <select
                            value={currentStatus}
                            disabled={updatingStatusId === `staff_${item.id}`}
                            onChange={event => void updateStaffStatus(item, event.target.value as StaffEmploymentStatus)}
                            className={`rounded-lg border-0 px-2 py-1 text-[10px] font-black uppercase outline-none ring-1 ring-transparent transition disabled:cursor-wait disabled:opacity-60 ${getStaffStatusClass(currentStatus)}`}
                          >
                            <option className={statusOptionClass} value="Active">Active</option>
                            <option className={statusOptionClass} value="Probation">Probation</option>
                            <option className={statusOptionClass} value="Inactive">Inactive</option>
                            <option className={statusOptionClass} value="Resigned">Resigned</option>
                          </select>
                        </td>
                        <td className="w-12 px-2 py-4 text-center">
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={event => openFloatingActionMenu(event, 'staff', item.id)}
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                              title="Staff actions"
                              aria-label={`Actions for ${item.profile?.full_name || item.username}`}
                              aria-expanded={isFloatingMenuOpen('staff', item.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center text-gray-400 dark:text-gray-600"><Users size={40} className="mb-3 opacity-30" /><p className="text-sm font-bold">No staff records found</p><button onClick={() => openStaffModal()} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Add First Staff</button></div>
          )}
        </div>
        )}

        {subTab === 'leave' && (
        isLeaveFormOpen ? (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">{editingLeaveId ? 'Edit Staff Leave' : 'Staff Leave'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Record MC, hospitalization, paternity, annual or other leave for staff.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-violet-700 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-300">
                <CalendarDays size={14} /> Leave
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PayrollSectionDivider title="Leave Details" />
              <div className="md:col-span-2">
                <label className={labelClass}>Staff</label>
                <select value={leaveForm.staffUserId} onChange={event => setLeaveForm(form => ({ ...form, staffUserId: event.target.value }))} className={fieldClass}>
                  <option value="">Select staff</option>
                  {staff.map(item => <option key={item.id} value={item.id}>{item.profile?.full_name || item.username} ({item.role})</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Leave Type</label>
                <select value={leaveForm.leaveType} onChange={event => setLeaveForm(form => ({ ...form, leaveType: event.target.value as LeaveType }))} className={fieldClass}>
                  {leaveTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={leaveForm.status} onChange={event => setLeaveForm(form => ({ ...form, status: event.target.value as LeaveStatus }))} className={fieldClass}>
                  {leaveStatusOptions.map(status => <option key={status} className={statusOptionClass} value={status}>{status}</option>)}
                </select>
              </div>
              <Field label="Start Date" type="date" value={leaveForm.startDate} onChange={value => setLeaveForm(form => ({ ...form, startDate: value, totalDays: inclusiveLeaveDays(value, form.endDate) }))} />
              <Field label="End Date" type="date" value={leaveForm.endDate} onChange={value => setLeaveForm(form => ({ ...form, endDate: value, totalDays: inclusiveLeaveDays(form.startDate, value) }))} />
              <Field label="Total Days" type="number" value={leaveForm.totalDays} onChange={value => setLeaveForm(form => ({ ...form, totalDays: n(value) }))} />
              <div className="md:col-span-2 xl:col-span-4">
                <label className={labelClass}>Notes</label>
                <textarea value={leaveForm.notes} onChange={event => setLeaveForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[92px]`} placeholder="Certificate ref, reason, handover notes, or approval reference" />
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => { setIsLeaveFormOpen(false); setEditingLeaveId(null); }} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Back to List</button>
              <button onClick={saveLeave} disabled={isSavingLeave || !leaveForm.staffUserId} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-40">{isSavingLeave ? 'Saving...' : editingLeaveId ? 'Save Changes' : 'Save Leave'}</button>
            </div>
          </div>
        ) : (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">Staff Leave</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">See who is on leave and manage leave records by type.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
                <div className="relative sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={leaveSearch} onChange={event => setLeaveSearch(event.target.value)} placeholder="Search leave..." className="h-[38px] w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <button onClick={() => openLeaveForm()} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                  <CalendarPlus size={14} /> Add Leave
                </button>
              </div>
            </div>
            {staffLeaves.length > 0 && (
              <div className="grid grid-cols-1 gap-3 border-b border-gray-100 p-4 dark:border-gray-700 sm:grid-cols-3">
                {[
                  { label: 'Leave Records', value: String(staffLeaves.length) },
                  { label: 'On Leave Today', value: String(peopleOnLeaveToday.length) },
                  { label: 'Visible Days', value: String(visibleLeaves.reduce((sum, leave) => sum + n(leave.total_days), 0)) },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{card.label}</p>
                    <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{card.value}</p>
                  </div>
                ))}
              </div>
            )}
            {visibleLeaves.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>{['Staff', 'Leave Type', 'Dates', 'Days', 'Entitlement', 'Status', 'Notes', 'Actions'].map(head => <th key={head} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${head === 'Actions' ? 'text-center' : ''}`}>{head}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {visibleLeaves.map(leave => {
                      const item = staff.find(staffItem => staffItem.id === leave.staff_user_id);
                      return (
                        <tr key={leave.id} className="transition">
                          <td className="px-5 py-4">
                            <p className="text-sm font-black text-gray-900 dark:text-white">{leave.staff_name || item?.profile?.full_name || item?.username || 'Staff'}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{leave.staff_role || item?.role || 'Leave'}</p>
                          </td>
                          <td className="px-5 py-4"><span className="rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">{leave.leave_type}</span></td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}</p></td>
                          <td className="px-5 py-4 text-xs font-black text-gray-900 dark:text-white">{n(leave.total_days)}</td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-500 dark:text-gray-400">{item ? getLeaveEntitlementLabel(item, leave.leave_type) : '-'}</td>
                          <td className="px-5 py-4">
                            <select
                              value={leave.status}
                              disabled={updatingStatusId === `leave_${leave.id}`}
                              onChange={event => void updateLeaveStatus(leave, event.target.value as LeaveStatus)}
                              className="rounded-lg border-0 bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600 outline-none ring-1 ring-transparent transition focus:ring-amber-300 disabled:cursor-wait disabled:opacity-60 dark:bg-gray-700 dark:text-gray-300"
                            >
                              {leaveStatusOptions.map(status => <option key={status} className={statusOptionClass} value={status}>{status}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[220px] truncate px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{leave.notes || '-'}</td>
                          <td className="px-5 py-4 text-center">
                            <div className="inline-flex justify-center">
                              <button
                                type="button"
                                onClick={event => openFloatingActionMenu(event, 'leave', leave.id)}
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                                title="Leave actions"
                                aria-label={`Actions for ${leave.staff_name || 'leave'}`}
                                aria-expanded={isFloatingMenuOpen('leave', leave.id)}
                              >
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-gray-400 dark:text-gray-600"><CalendarDays size={40} className="mb-3 opacity-30" /><p className="text-sm font-bold">{staffLeaves.length ? 'No matching leave records' : 'No leave records found'}</p><button onClick={() => openLeaveForm()} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Add Leave</button></div>
            )}
          </div>
        )
        )}

        {subTab === 'payroll' && (
        isPayslipFormOpen ? (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">{editingPayslipId ? 'Edit Staff Payslip' : 'Staff Payslip'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Editable payroll fields: EPF, SOCSO, EIS, PCB tax, allowances and deductions.</p>
              </div>
              <button onClick={reviewPayslip} disabled={!payrollForm.staffUserId} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                <FileText size={14} /> Review Payslip
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="md:col-span-2 xl:col-span-4">
                <h4 className="mb-3 text-sm font-semibold text-sky-600 dark:text-sky-400">Staff Details</h4>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr_1fr]">
                  <div>
                    <label className={labelClass}>Staff</label>
                    <select value={payrollForm.staffUserId} onChange={event => { const selected = staff.find(item => item.id === event.target.value); if (selected) applyPayrollTemplate(selected); else { setOvertimeRate(0); setOvertimeEntries([blankOvertimeEntry()]); setIsOvertimeOpen(false); setPayrollForm(form => ({ ...form, staffUserId: '', overtimeAmount: 0 })); } }} className={fieldClass}>
                      <option value="">Select staff</option>
                      {staff.map(item => <option key={item.id} value={item.id}>{item.profile?.full_name || item.username} ({item.role})</option>)}
                    </select>
                  </div>
                  {renderPeriodPicker('Pay Period', payrollForm.payPeriod, value => setPayrollForm(form => ({ ...form, payPeriod: value })))}
                  <Field label="Pay Date" type="date" value={payrollForm.payDate} onChange={value => setPayrollForm(form => ({ ...form, payDate: value }))} />
                </div>
              </div>

              <PayrollSectionDivider title="Earnings" />
              <Field label="Basic Salary" type="number" value={payrollForm.basicSalary} onChange={value => setPayrollForm(form => ({ ...form, basicSalary: n(value) }))} />
              <Field label="Allowances" type="number" value={payrollForm.allowanceAmount} onChange={value => setPayrollForm(form => ({ ...form, allowanceAmount: n(value) }))} />
              <Field label="Bonus" type="number" value={payrollForm.bonusAmount} onChange={value => setPayrollForm(form => ({ ...form, bonusAmount: n(value) }))} />
              <Field label="OT Base Rate / Hour" type="number" value={overtimeRate} onChange={value => setOvertimeRate(n(value))} />
              <div className="mt-2 md:col-span-2 xl:col-span-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                <div className={`${isOvertimeOpen ? 'mb-3' : ''} flex items-center justify-between gap-3`}>
                  <label className={labelClass}>Overtime</label>
                  <div className="flex items-center gap-2">
                    {isOvertimeOpen && (
                      <button onClick={() => setIsOvertimeOpen(false)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 shadow-sm ring-1 ring-gray-200 transition hover:text-gray-700 hover:ring-gray-300 dark:bg-gray-800 dark:ring-gray-700 dark:hover:text-gray-200">
                        Cancel
                      </button>
                    )}
                    <button onClick={() => { if (!isOvertimeOpen) { setIsOvertimeOpen(true); return; } setOvertimeEntries(entries => [...entries, blankOvertimeEntry()]); }} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-600 shadow-sm ring-1 ring-gray-200 transition hover:ring-amber-300 dark:bg-gray-800 dark:ring-gray-700">
                      <Plus size={12} /> Add OT
                    </button>
                  </div>
                </div>
                {isOvertimeOpen && (
                  <>
                    <div className="space-y-2">
                      {overtimeEntries.map((entry, index) => {
                        const amount = n(entry.hours) * n(overtimeRate) * n(entry.multiplier);
                        return (
                          <div key={entry.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                            <div>
                              <label className={labelClass}>Hours</label>
                              <input type="number" min="0" step="0.01" value={entry.hours || ''} onChange={event => setOvertimeEntries(entries => entries.map(item => item.id === entry.id ? { ...item, hours: n(event.target.value) } : item))} className={fieldClass} placeholder="0" />
                            </div>
                            <div>
                              <label className={labelClass}>Multiplier</label>
                              <select value={entry.multiplier} onChange={event => setOvertimeEntries(entries => entries.map(item => item.id === entry.id ? { ...item, multiplier: n(event.target.value) } : item))} className={fieldClass}>
                                {overtimeMultipliers.map(multiplier => <option key={multiplier} value={multiplier}>{multiplier.toFixed(1)}X</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Amount</label>
                              <div className={`${fieldClass} bg-white font-bold dark:bg-gray-800`}>{fmt(amount)}</div>
                            </div>
                            <button onClick={() => setOvertimeEntries(entries => entries.length === 1 ? entries : entries.filter(item => item.id !== entry.id))} disabled={overtimeEntries.length === 1} className="rounded-xl p-3 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-900/20" title={`Remove OT ${index + 1}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-end pt-3 text-sm">
                      <span className="text-gray-500">Overtime Total: <b className="text-gray-900 dark:text-white">{fmt(overtimeTotal)}</b></span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 md:col-span-2 xl:col-span-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-sky-600 dark:text-sky-400">Deductions</h4>
                    <span className="text-xs font-bold text-rose-500">-{fmt(payrollTotals.deductions)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <EpfContributionField
                        label="EPF Employee"
                        mode={epfEmployeeMode}
                        percentage={epfEmployeePercent}
                        amount={payrollForm.epfEmployee}
                        baseAmount={payrollForm.basicSalary}
                        currencySymbol={currencySymbol}
                        onModeChange={setEpfEmployeeMode}
                        onPercentageChange={setEpfEmployeePercent}
                        onAmountChange={value => setPayrollForm(form => ({ ...form, epfEmployee: value }))}
                      />
                    </div>
                    <Field label="SOCSO" type="number" value={payrollForm.socsoEmployee} onChange={value => setPayrollForm(form => ({ ...form, socsoEmployee: n(value) }))} />
                    <Field label="EIS" type="number" value={payrollForm.eisEmployee} onChange={value => setPayrollForm(form => ({ ...form, eisEmployee: n(value) }))} />
                    <Field label="PCB / Tax" type="number" value={payrollForm.taxPcb} onChange={value => setPayrollForm(form => ({ ...form, taxPcb: n(value) }))} />
                    <Field label="Unpaid Leave" type="number" value={payrollForm.unpaidLeaveDeduction} onChange={value => setPayrollForm(form => ({ ...form, unpaidLeaveDeduction: n(value) }))} />
                    <div>
                      <label className={labelClass}>Other Deduction Name</label>
                      <input value={payrollForm.otherDeductionName} onChange={event => setPayrollForm(form => ({ ...form, otherDeductionName: event.target.value }))} className={fieldClass} />
                    </div>
                    <Field label="Other Deduction Amount" type="number" value={payrollForm.otherDeductions} onChange={value => setPayrollForm(form => ({ ...form, otherDeductions: n(value) }))} />
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-sky-600 dark:text-sky-400">Company Contribution</h4>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{fmt(companyContributionTotal)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <EpfContributionField
                        label="Employer EPF"
                        mode={epfEmployerMode}
                        percentage={epfEmployerPercent}
                        amount={payrollForm.epfEmployer}
                        baseAmount={payrollForm.basicSalary}
                        currencySymbol={currencySymbol}
                        onModeChange={setEpfEmployerMode}
                        onPercentageChange={setEpfEmployerPercent}
                        onAmountChange={value => setPayrollForm(form => ({ ...form, epfEmployer: value }))}
                      />
                    </div>
                    <Field label="Employer SOCSO" type="number" value={payrollForm.socsoEmployer} onChange={value => setPayrollForm(form => ({ ...form, socsoEmployer: n(value) }))} />
                    <Field label="Employer EIS" type="number" value={payrollForm.eisEmployer} onChange={value => setPayrollForm(form => ({ ...form, eisEmployer: n(value) }))} />
                    <div>
                      <label className={labelClass}>Other Contribution Name</label>
                      <input value={payrollForm.otherContributionName} onChange={event => setPayrollForm(form => ({ ...form, otherContributionName: event.target.value }))} className={fieldClass} />
                    </div>
                    <Field label="Other Contribution Amount" type="number" value={payrollForm.otherContributionAmount} onChange={value => setPayrollForm(form => ({ ...form, otherContributionAmount: n(value) }))} />
                  </div>
                </div>
              </div>

              <div className="mt-3 md:col-span-2 xl:col-span-4">
                <h4 className="mb-3 text-sm font-semibold text-sky-600 dark:text-sky-400">Other Details</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><label className={labelClass}>Payment Method</label><select value={payrollForm.paymentMethod} onChange={event => setPayrollForm(form => ({ ...form, paymentMethod: event.target.value }))} className={fieldClass}><option>Bank Transfer</option><option>Cash</option><option>Cheque</option></select></div>
                  <div><label className={labelClass}>Status</label><select value={payrollForm.status} onChange={event => setPayrollForm(form => ({ ...form, status: event.target.value as PayrollForm['status'] }))} className={fieldClass}><option className={statusOptionClass} value="draft">Draft</option><option className={statusOptionClass} value="approved">Approved</option><option className={statusOptionClass} value="paid">Paid</option></select></div>
                  <div className="md:col-span-2"><label className={labelClass}>Notes</label><textarea value={payrollForm.notes} onChange={event => setPayrollForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[80px]`} /></div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => { setIsPayslipFormOpen(false); setEditingPayslipId(null); }} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Back to List</button>
              <button onClick={savePayslip} disabled={isSavingPayslip || !payrollForm.staffUserId} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-40">{isSavingPayslip ? 'Saving...' : editingPayslipId ? 'Save Changes' : 'Save Payslip'}</button>
            </div>
          </div>
        ) : (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">Staff Payslip</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review saved payslips and create a new staff payroll record.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
                <div className="relative sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={payslipSearch} onChange={event => setPayslipSearch(event.target.value)} placeholder="Search payslip..." className="h-[38px] w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <select value={payslipStatusFilter} onChange={event => setPayslipStatusFilter(event.target.value as 'all' | PayrollPayslip['status'])} className="h-[38px] rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold uppercase tracking-wider text-gray-600 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  <option className={statusOptionClass} value="all">All Status</option>
                  <option className={statusOptionClass} value="draft">Draft</option>
                  <option className={statusOptionClass} value="approved">Approved</option>
                  <option className={statusOptionClass} value="paid">Paid</option>
                </select>
                <button onClick={() => openPayslipForm()} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                  <Plus size={14} /> Create Payslip
                </button>
              </div>
            </div>
            {visiblePayslips.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>{['Staff', 'Pay Period', 'Gross Pay', 'Deductions', 'Net Pay', 'Status', 'Actions'].map(head => <th key={head} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${head === 'Actions' ? 'text-center' : ''}`}>{head}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {visiblePayslips.map(payslip => {
                      const item = staff.find(staffItem => staffItem.id === payslip.staff_user_id);
                      const deductions = n(payslip.epf_employee) + n(payslip.socso_employee) + n(payslip.eis_employee) + n(payslip.tax_pcb) + n(payslip.unpaid_leave_deduction) + n(payslip.other_deductions);
                      return (
                        <tr key={payslip.id} className="transition">
                          <td className="px-5 py-4">
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white">{item?.profile?.full_name || item?.username || 'Staff'}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item?.profile?.employee_code || item?.role || 'Payroll'}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{payslip.pay_period}</p><p>{new Date(payslip.pay_date).toLocaleDateString()}</p></td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{fmt(payslip.gross_pay)}</td>
                          <td className="px-5 py-4 text-xs font-bold text-rose-500">-{fmt(deductions)}</td>
                          <td className="px-5 py-4 text-xs font-black text-emerald-600 dark:text-emerald-400">{fmt(payslip.net_pay)}</td>
                          <td className="px-5 py-4">
                            <select
                              value={payslip.status}
                              disabled={updatingStatusId === `payslip_${payslip.id}`}
                              onChange={event => void updatePayslipStatus(payslip, event.target.value as PayrollPayslip['status'])}
                              className="rounded-lg border-0 bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600 outline-none ring-1 ring-transparent transition focus:ring-amber-300 disabled:cursor-wait disabled:opacity-60 dark:bg-gray-700 dark:text-gray-300"
                            >
                              <option className={statusOptionClass} value="draft">Draft</option>
                              <option className={statusOptionClass} value="approved">Approved</option>
                              <option className={statusOptionClass} value="paid">Paid</option>
                            </select>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="inline-flex justify-center">
                              <button
                                type="button"
                                onClick={event => openFloatingActionMenu(event, 'payslip', payslip.id)}
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                                title="Payslip actions"
                                aria-label={`Actions for ${item?.profile?.full_name || item?.username || 'payslip'}`}
                                aria-expanded={isFloatingMenuOpen('payslip', payslip.id)}
                              >
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-gray-400 dark:text-gray-600"><FileText size={40} className="mb-3 opacity-30" /><p className="text-sm font-bold">{payslips.length ? 'No matching payslips' : 'No payslips found'}</p><button onClick={() => openPayslipForm()} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Create Payslip</button></div>
            )}
          </div>
        )
        )}

        {subTab === 'claims' && (
        isClaimFormOpen ? (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">{editingClaimId ? 'Edit Staff Claim' : 'Staff Claim'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Record staff reimbursements and sync them into Staff expenses as claim entries.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300">
                <FileText size={14} /> Staff Claims
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PayrollSectionDivider title="Staff Details" />
              <div className="md:col-span-2">
                <label className={labelClass}>Staff</label>
                <select value={claimForm.staffUserId} onChange={event => setClaimForm(form => ({ ...form, staffUserId: event.target.value }))} className={fieldClass}>
                  <option value="">Select staff</option>
                  {staff.map(item => <option key={item.id} value={item.id}>{item.profile?.full_name || item.username} ({item.role})</option>)}
                </select>
              </div>
              {renderPeriodPicker('Claim Period', claimForm.claimPeriod, value => setClaimForm(form => ({ ...form, claimPeriod: value })))}
              <Field label="Claim Date" type="date" value={claimForm.claimDate} onChange={value => setClaimForm(form => ({ ...form, claimDate: value }))} />

              <PayrollSectionDivider title="Claim Details" />
              <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className={labelClass}>Claim Items</label>
                  <button type="button" onClick={() => setClaimForm(form => ({ ...form, items: [...form.items, blankClaimLine()] }))} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-600 shadow-sm ring-1 ring-gray-200 transition hover:ring-amber-300 dark:bg-gray-800 dark:ring-gray-700">
                    <Plus size={12} /> Add Claim
                  </button>
                </div>
                <div className="space-y-3">
                  {claimForm.items.map((line, index) => (
                    <div key={line.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_140px_1fr_1fr_auto] lg:items-end">
                        <div>
                          <label className={labelClass}>Claim Type</label>
                          <select value={line.claimType} onChange={event => setClaimForm(form => ({ ...form, items: form.items.map(item => item.id === line.id ? { ...item, claimType: event.target.value } : item) }))} className={fieldClass}>
                            {claimTypes.map(type => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </div>
                        <Field label="Amount" type="number" value={line.amount} onChange={value => setClaimForm(form => ({ ...form, items: form.items.map(item => item.id === line.id ? { ...item, amount: n(value) } : item) }))} />
                        <Field label="Receipt / Reference" value={line.receiptRef} onChange={value => setClaimForm(form => ({ ...form, items: form.items.map(item => item.id === line.id ? { ...item, receiptRef: value } : item) }))} />
                        <Field label="Line Notes" value={line.notes} onChange={value => setClaimForm(form => ({ ...form, items: form.items.map(item => item.id === line.id ? { ...item, notes: value } : item) }))} />
                        <button type="button" onClick={() => setClaimForm(form => ({ ...form, items: form.items.length === 1 ? form.items : form.items.filter(item => item.id !== line.id) }))} disabled={claimForm.items.length === 1} className="rounded-xl p-3 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-900/20" title={`Remove claim ${index + 1}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <PayrollSectionDivider title="Payment & Notes" />
              <div>
                <label className={labelClass}>Payment Method</label>
                <select value={claimForm.paymentMethod} onChange={event => setClaimForm(form => ({ ...form, paymentMethod: event.target.value }))} className={fieldClass}>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Cheque</option>
                  <option>Card</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={claimForm.status} onChange={event => setClaimForm(form => ({ ...form, status: event.target.value as ClaimForm['status'] }))} className={fieldClass}>
                  <option className={statusOptionClass} value="draft">Draft</option>
                  <option className={statusOptionClass} value="approved">Approved</option>
                  <option className={statusOptionClass} value="paid">Paid</option>
                </select>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <label className={labelClass}>Claim Notes</label>
                <textarea value={claimForm.notes} onChange={event => setClaimForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[92px]`} placeholder="Purpose, receipt details, or approval reference" />
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Claim Total</p>
                <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{fmt(claimFormTotal)}</p>
                <p className="mt-1 text-[11px] text-emerald-700/70 dark:text-emerald-300/70">Appears in Expenses under Staff / Claims.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => { setIsClaimFormOpen(false); setEditingClaimId(null); }} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Back to List</button>
              <button onClick={saveClaim} disabled={isSavingClaim || !claimForm.staffUserId || claimFormTotal <= 0} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-40">{isSavingClaim ? 'Saving...' : editingClaimId ? 'Save Changes' : 'Save Claim'}</button>
            </div>
          </div>
        ) : (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">Staff Claim</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Create and review staff reimbursement claims linked to Staff expenses.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
                <div className="relative sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={claimSearch} onChange={event => setClaimSearch(event.target.value)} placeholder="Search claim..." className="h-[38px] w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <button onClick={() => openClaimForm()} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                  <Plus size={14} /> Create Claim
                </button>
              </div>
            </div>
            {staffClaims.length > 0 && (
              <div className="grid grid-cols-1 gap-3 border-b border-gray-100 p-4 dark:border-gray-700 sm:grid-cols-3">
                {[
                  { label: 'Total Claims', value: String(staffClaims.length) },
                  { label: 'Claim Amount', value: fmt(staffClaims.reduce((sum, claim) => sum + n(claim.total_amount), 0)) },
                  { label: 'Visible', value: fmt(visibleClaims.reduce((sum, claim) => sum + n(claim.total_amount), 0)) },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{card.label}</p>
                    <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{card.value}</p>
                  </div>
                ))}
              </div>
            )}
            {visibleClaims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>{['Staff', 'Claim Date', 'Type', 'Amount', 'Payment', 'Notes', 'Actions'].map(head => <th key={head} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${head === 'Actions' ? 'text-center' : ''}`}>{head}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {visibleClaims.map(claim => {
                      const claimTypeSummary = claim.items.map(item => item.claim_type).filter(Boolean).join(', ') || 'Claims';
                      const noteSummary = claim.notes || claim.items.map(item => item.notes || item.receipt_ref).filter(Boolean).join(', ') || '-';
                      return (
                        <tr key={claim.id} className="transition">
                          <td className="px-5 py-4">
                            <p className="text-sm font-black text-gray-900 dark:text-white">{claim.staff_name || 'Staff'}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{claim.staff_role || 'Claim'}</p>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{claim.claim_period || monthLabel()}</p><p>{new Date(claim.claim_date).toLocaleDateString()}</p></td>
                          <td className="px-5 py-4"><span className="rounded-lg bg-sky-100 px-2 py-1 text-[10px] font-black text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">{claimTypeSummary}</span></td>
                          <td className="px-5 py-4 text-xs font-black text-emerald-600 dark:text-emerald-400">{fmt(claim.total_amount)}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{claim.payment_method}</td>
                          <td className="max-w-[220px] truncate px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{noteSummary}</td>
                          <td className="px-5 py-4 text-center">
                            <div className="inline-flex justify-center">
                              <button
                                type="button"
                                onClick={event => openFloatingActionMenu(event, 'claim', claim.id)}
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                                title="Claim actions"
                                aria-label={`Actions for ${claim.staff_name || 'claim'}`}
                                aria-expanded={isFloatingMenuOpen('claim', claim.id)}
                              >
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-gray-400 dark:text-gray-600"><FileText size={40} className="mb-3 opacity-30" /><p className="text-sm font-bold">{staffClaims.length ? 'No matching claims' : 'No staff claims found'}</p><button onClick={() => openClaimForm()} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Create Claim</button></div>
            )}
          </div>
        )
        )}

        {subTab === 'departments' && (
        <div className="grid grid-cols-1 gap-5 rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:grid-cols-[420px_1fr]">
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Add Department</h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Departments connect employees to branches, job groups or kitchen sections.</p>
            <div className="space-y-3">
              <input value={departmentName} onChange={event => setDepartmentName(event.target.value)} placeholder="Department name" className={fieldClass} />
              <input value={departmentCode} onChange={event => setDepartmentCode(event.target.value)} placeholder="Code, e.g. FOH" className={fieldClass} />
              <button onClick={addDepartment} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Save Department</button>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="mb-4 text-sm font-black text-gray-900 dark:text-white">Departments</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {departments.length ? departments.map(department => {
                const isActive = department.is_active !== false;
                return (
                  <div key={department.id} className="rounded-xl border border-gray-100 p-4 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-gray-900 dark:text-white">{department.name}</p>
                        <p className="text-xs text-gray-400">{department.code || 'No code'}</p>
                      </div>
                      <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{staff.filter(item => item.profile?.department_id === department.id).length} staff</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</span>
                      <select
                        value={isActive ? 'active' : 'inactive'}
                        disabled={updatingStatusId === `department_${department.id}`}
                        onChange={event => void updateDepartmentStatus(department, event.target.value === 'active')}
                        className={`rounded-lg border-0 px-2 py-1 text-[10px] font-black uppercase outline-none ring-1 ring-transparent transition disabled:cursor-wait disabled:opacity-60 ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-700 focus:ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 focus:ring-rose-300 dark:bg-rose-500/20 dark:text-rose-300'
                        }`}
                      >
                        <option className={statusOptionClass} value="active">Active</option>
                        <option className={statusOptionClass} value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                );
              }) : <p className="text-xs text-gray-400">No departments yet.</p>}
            </div>
          </div>
        </div>
        )}
      </div>

      {renderFloatingActionMenu()}

      {selectedDetailStaff && renderModalPortal((() => {
        const item = selectedDetailStaff;
        const department = departments.find(dept => dept.id === item.profile?.department_id);
        const currentStatus = (item.profile?.employment_status || (item.is_active === false ? 'Inactive' : 'Active')) as StaffEmploymentStatus;
        const displayName = item.profile?.full_name || item.username;
        const leaveBalanceCards = (['Annual', 'MC', 'Paternity', 'Hospitalization'] as LeaveType[]).map(type => ({ type, ...getLeaveBalanceForStaff(item, type) }));
        const otherTaken = getLeaveTakenForStaff(item.id, 'Other');
        const recentLeaves = staffLeaves.filter(leave => leave.staff_user_id === item.id && leave.status !== 'cancelled').slice(0, 4);
        const pages = [
          (
            <div key="dashboard" className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                  {leaveBalanceCards.map(card => (
                    <div key={card.type} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{card.type === 'Hospitalization' ? 'Hospital' : card.type}</p>
                      <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{card.balance === null ? '-' : card.balance}</p>
                      <p className="text-[10px] font-semibold text-gray-400">Taken {card.taken} / {card.entitlement ?? '-'}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
                    <p className="text-[10px] font-black uppercase tracking-wider text-rose-500">Unpaid / Other</p>
                    <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-300">{otherTaken}</p>
                    <p className="text-[10px] font-semibold text-rose-500/80">Taken this year</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryTile label="Date Joined" value={formatDate(item.profile?.hire_date)} />
                  <SummaryTile label="Service" value={`${serviceYearsCompleted(item.profile?.hire_date)} year(s)`} />
                  <SummaryTile label="Department" value={department?.name || 'Unassigned'} />
                  <SummaryTile label="Employment" value={currentStatus} positive={currentStatus === 'Active'} />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">Recent Leave</p>
                  <CalendarDays size={16} className="text-violet-500" />
                </div>
                <div className="space-y-2">
                  {recentLeaves.length > 0 ? recentLeaves.map(leave => (
                    <div key={leave.id} className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-gray-800 dark:text-gray-100">{leave.leave_type}</p>
                        <span className="text-[10px] font-black uppercase text-gray-400">{leave.status}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] font-semibold text-gray-400">{formatDate(leave.start_date)} - {formatDate(leave.end_date)} · {n(leave.total_days)} day(s)</p>
                    </div>
                  )) : <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs font-bold text-gray-400 dark:bg-gray-900/60">No leave recorded</p>}
                </div>
              </div>
            </div>
          ),
          (
            <div key="profile" className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
              {[
                ['Username', item.username],
                ['Role', item.role],
                ['Employee Code', item.profile?.employee_code || '-'],
                ['Email', item.email || '-'],
                ['Phone', item.phone || '-'],
                ['IC / Passport', item.profile?.ic_number || '-'],
                ['Nationality', item.profile?.nationality || '-'],
                ['Job Title', item.profile?.job_title || '-'],
                ['Employment Type', item.profile?.employment_type || '-'],
                ['Emergency Name', item.profile?.emergency_contact_name || '-'],
                ['Emergency Phone', item.profile?.emergency_contact_phone || '-'],
                ['Notes', item.profile?.notes || '-'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold text-gray-800 dark:text-gray-100">{value}</p>
                </div>
              ))}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 md:col-span-3 dark:border-gray-700 dark:bg-gray-900/60">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Address</p>
                <p className="mt-1 break-words text-sm font-bold text-gray-800 dark:text-gray-100">{item.profile?.address || '-'}</p>
              </div>
            </div>
          ),
          (
            <div key="payroll" className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
              {[
                ['Basic Salary', `${fmt(n(item.profile?.salary_amount))} / ${getPayFrequencyLabel(item.profile?.pay_frequency)}`],
                ['OT Rate', fmt(n(item.profile?.overtime_rate))],
                ['Default Allowance', fmt(n(item.profile?.default_allowances?.fixed))],
                ['Default Deduction', fmt(n(item.profile?.default_deductions?.fixed))],
                ['Bank Name', item.profile?.bank_name || '-'],
                ['Bank Account', item.profile?.bank_account_no || '-'],
                ['EPF No.', item.profile?.epf_no || '-'],
                ['SOCSO No.', item.profile?.socso_no || '-'],
                ['Tax No.', item.profile?.tax_no || '-'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold text-gray-800 dark:text-gray-100">{value}</p>
                </div>
              ))}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 md:col-span-3 dark:border-gray-700 dark:bg-gray-900/60">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Leave Entitlement Setup</p>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                  {leaveTypes.map(type => (
                    <div key={type} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {type}: {getLeaveEntitlementLabel(item, type)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ),
        ];
        const pageLabels = ['Dashboard', 'Profile', 'Payroll'];

        return (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setStaffDetailId(null)}>
            <div className="flex h-[92vh] max-h-[760px] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={event => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600">Employee Profile</p>
                  <h3 className="mt-1 truncate text-2xl font-black text-gray-900 dark:text-white">{displayName}</h3>
                  <p className="text-xs font-semibold text-gray-400">{item.profile?.employee_code || item.username} · {department?.name || 'Unassigned'} · {item.role}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => { setStaffDetailId(null); openStaffModal(item); }} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                    <Edit3 size={14} /> Edit
                  </button>
                  <button type="button" onClick={() => setStaffDetailId(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
                </div>
              </div>
              <div className="mb-4 flex gap-2">
                {pageLabels.map((label, index) => (
                  <button key={label} type="button" onClick={() => setStaffDetailPage(index)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${staffDetailPage === index ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-900 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{pages[staffDetailPage]}</div>
              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={() => setStaffDetailPage(page => Math.max(0, page - 1))} disabled={staffDetailPage === 0} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500 transition hover:border-amber-300 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700">
                  Back
                </button>
                <div className="flex items-center gap-2">
                  {pages.map((_, index) => (
                    <button key={index} type="button" aria-label={`Go to ${pageLabels[index]}`} onClick={() => setStaffDetailPage(index)} className={`h-2.5 rounded-full transition-all ${staffDetailPage === index ? 'w-8 bg-amber-600' : 'w-2.5 bg-gray-300 dark:bg-gray-600'}`} />
                  ))}
                </div>
                <button type="button" onClick={() => setStaffDetailPage(page => Math.min(pages.length - 1, page + 1))} disabled={staffDetailPage === pages.length - 1} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500 transition hover:border-amber-300 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700">
                  Next
                </button>
              </div>
            </div>
          </div>
        );
      })())}

      {staffModalOpen && renderModalPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setStaffModalOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-gray-900 dark:text-white">{editingStaffId ? 'Edit Staff Profile' : 'Add Staff Profile'}</h3><p className="text-xs text-gray-500 dark:text-gray-400">Account login, department, employment, salary and statutory details.</p></div><button onClick={() => setStaffModalOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SectionDivider title="User Access" />
              <Field label="Username *" value={staffForm.username} onChange={value => setStaffForm(form => ({ ...form, username: value }))} />
              <Field label={editingStaffId ? 'Password (leave blank)' : 'Password *'} type="password" value={staffForm.password} onChange={value => setStaffForm(form => ({ ...form, password: value }))} />
              <div><label className={labelClass}>Role</label><select value={staffForm.role} onChange={event => setStaffForm(form => ({ ...form, role: event.target.value as StaffRole }))} className={fieldClass}><option value="CASHIER">Cashier</option><option value="KITCHEN">Kitchen</option><option value="ORDER_TAKER">Order Taker</option><option value="MANAGER">Manager</option><option value="HR">Human Resources</option></select></div>
              <SectionDivider title="User Details" />
              <Field label="Full Name" value={staffForm.fullName} onChange={value => setStaffForm(form => ({ ...form, fullName: value }))} />
              <Field label="Employee Code" value={staffForm.employeeCode} onChange={value => setStaffForm(form => ({ ...form, employeeCode: value }))} />
              <div><label className={labelClass}>Department</label><select value={staffForm.departmentId} onChange={event => setStaffForm(form => ({ ...form, departmentId: event.target.value }))} className={fieldClass}><option value="">Unassigned</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
              <Field label="Job Title" value={staffForm.jobTitle} onChange={value => setStaffForm(form => ({ ...form, jobTitle: value }))} />
              <Field label="Email" value={staffForm.email} onChange={value => setStaffForm(form => ({ ...form, email: value }))} />
              <Field label="Phone" value={staffForm.phone} onChange={value => setStaffForm(form => ({ ...form, phone: value }))} />
              <Field label="IC / Passport" value={staffForm.icNumber} onChange={value => setStaffForm(form => ({ ...form, icNumber: value }))} />
              <Field label="Country of citizen" value={staffForm.nationality} onChange={value => setStaffForm(form => ({ ...form, nationality: value }))} />
              <SectionDivider title="Employment & Salary" />
              <div><label className={labelClass}>Employment Type</label><select value={staffForm.employmentType} onChange={event => setStaffForm(form => ({ ...form, employmentType: event.target.value }))} className={fieldClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></div>
              <div><label className={labelClass}>Status</label><select value={staffForm.employmentStatus} onChange={event => setStaffForm(form => ({ ...form, employmentStatus: event.target.value }))} className={fieldClass}><option className={statusOptionClass}>Active</option><option className={statusOptionClass}>Probation</option><option className={statusOptionClass}>Inactive</option><option className={statusOptionClass}>Resigned</option></select></div>
              <Field label="Hire Date" type="date" value={staffForm.hireDate} onChange={value => setStaffForm(form => ({ ...form, hireDate: value }))} />
              <Field label="Basic Salary" type="number" value={staffForm.salaryAmount} onChange={value => setStaffForm(form => ({ ...form, salaryAmount: n(value) }))} />
              <div><label className={labelClass}>Pay Frequency</label><select value={staffForm.payFrequency} onChange={event => setStaffForm(form => ({ ...form, payFrequency: event.target.value }))} className={fieldClass}><option>Monthly</option><option>Weekly</option><option>Daily</option></select></div>
              <Field label="OT Rate" type="number" value={staffForm.overtimeRate} onChange={value => setStaffForm(form => ({ ...form, overtimeRate: n(value) }))} />
              <Field label="Default Allowance" type="number" value={staffForm.defaultAllowance} onChange={value => setStaffForm(form => ({ ...form, defaultAllowance: n(value) }))} />
              <Field label="Default Deduction" type="number" value={staffForm.defaultDeduction} onChange={value => setStaffForm(form => ({ ...form, defaultDeduction: n(value) }))} />
              <SectionDivider title="Leave Entitlement" />
              <div className="md:col-span-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
                <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  {leaveTypes.map(type => {
                    const rule = normalizeLeaveEntitlements(staffForm.leaveEntitlements).types[type];
                    return (
                      <div key={type} className="grid grid-cols-[minmax(0,1fr)_auto_96px] items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 dark:border-gray-700 sm:grid-cols-[minmax(0,1fr)_auto_140px]">
                        <span className="min-w-0 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300">{type}</span>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input type="checkbox" checked={rule.enabled} onChange={event => updateLeaveEntitlementType(type, { enabled: event.target.checked })} className="peer sr-only" />
                          <span className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-amber-500 dark:bg-gray-700" />
                          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                        </label>
                        <div>
                          <input type="number" min="0" step="0.5" disabled={!rule.enabled} value={rule.days || ''} onChange={event => updateLeaveEntitlementType(type, { days: n(event.target.value) })} className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-right text-sm font-bold text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white" placeholder="0" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">Annual Leave Levels</p>
                      <p className="text-[11px] text-gray-400">Set annual leave by service year; the current entitlement updates from the staff hire date.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                        <input type="checkbox" checked={staffForm.leaveEntitlements.annualLevelsEnabled} onChange={event => updateLeaveEntitlements({ annualLevelsEnabled: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                        Use levels
                      </label>
                      <button type="button" onClick={() => updateLeaveEntitlements({ annualLevels: [...normalizeLeaveEntitlements(staffForm.leaveEntitlements).annualLevels, { id: crypto.randomUUID(), serviceYear: 1, days: 0 }] })} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 transition hover:border-amber-300 hover:text-amber-600 dark:border-gray-700">
                        <Plus size={12} /> Level
                      </button>
                    </div>
                  </div>
                  {staffForm.leaveEntitlements.annualLevelsEnabled && (
                    <div className="mt-3 space-y-2">
                      {normalizeLeaveEntitlements(staffForm.leaveEntitlements).annualLevels.map(level => (
                        <div key={level.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input type="number" min="1" value={level.serviceYear || ''} onChange={event => updateAnnualLeaveLevel(level.id, { serviceYear: Math.max(1, Math.round(n(event.target.value) || 1)) })} className={fieldClass} placeholder="Service year" />
                          <input type="number" min="0" step="0.5" value={level.days || ''} onChange={event => updateAnnualLeaveLevel(level.id, { days: n(event.target.value) })} className={fieldClass} placeholder="Annual days" />
                          <button type="button" onClick={() => updateLeaveEntitlements({ annualLevels: normalizeLeaveEntitlements(staffForm.leaveEntitlements).annualLevels.filter(item => item.id !== level.id) })} disabled={staffForm.leaveEntitlements.annualLevels.length === 1} className="rounded-xl p-3 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-900/20">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <SectionDivider title="Bank & Statutory" />
              <Field label="Bank Name" value={staffForm.bankName} onChange={value => setStaffForm(form => ({ ...form, bankName: value }))} />
              <Field label="Bank Account" value={staffForm.bankAccountNo} onChange={value => setStaffForm(form => ({ ...form, bankAccountNo: value }))} />
              <Field label="EPF No." value={staffForm.epfNo} onChange={value => setStaffForm(form => ({ ...form, epfNo: value }))} />
              <Field label="SOCSO No." value={staffForm.socsoNo} onChange={value => setStaffForm(form => ({ ...form, socsoNo: value }))} />
              <Field label="Tax No." value={staffForm.taxNo} onChange={value => setStaffForm(form => ({ ...form, taxNo: value }))} />
              <SectionDivider title="Emergency & Notes" />
              <Field label="Emergency Name" value={staffForm.emergencyContactName} onChange={value => setStaffForm(form => ({ ...form, emergencyContactName: value }))} />
              <Field label="Emergency Phone" value={staffForm.emergencyContactPhone} onChange={value => setStaffForm(form => ({ ...form, emergencyContactPhone: value }))} />
              <div className="md:col-span-3"><label className={labelClass}>Address</label><textarea value={staffForm.address} onChange={event => setStaffForm(form => ({ ...form, address: event.target.value }))} className={`${fieldClass} min-h-[70px]`} /></div>
              <div className="md:col-span-3"><label className={labelClass}>Notes</label><textarea value={staffForm.notes} onChange={event => setStaffForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[70px]`} /></div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setStaffModalOpen(false)} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button><button onClick={saveStaff} disabled={isSavingStaff} className="rounded-xl bg-amber-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 disabled:opacity-50">{isSavingStaff ? 'Saving...' : 'Save Staff'}</button></div>
          </div>
        </div>
      )}

      {previewPayslip && renderModalPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPreviewPayslip(null)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600">Payslip</p><h3 className="text-xl font-black text-gray-900 dark:text-white">{selectedPreviewStaff?.profile?.full_name || selectedPreviewStaff?.username || 'Staff'}</h3><p className="text-xs text-gray-500">{previewPayslip.pay_period} - {new Date(previewPayslip.pay_date).toLocaleDateString()}</p></div><button onClick={() => setPreviewPayslip(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <SummaryTile label="Basic" value={fmt(previewPayslip.basic_salary)} />
              <SummaryTile label="Gross" value={fmt(previewPayslip.gross_pay)} />
              <SummaryTile label="EPF Employee" value={`-${fmt(previewPayslip.epf_employee)}`} />
              <SummaryTile label="SOCSO / EIS" value={`-${fmt(n(previewPayslip.socso_employee) + n(previewPayslip.eis_employee))}`} />
              <SummaryTile label="Tax / PCB" value={`-${fmt(previewPayslip.tax_pcb)}`} />
              <SummaryTile label={previewPayslip.other_deduction_name || 'Other Deductions'} value={`-${fmt(previewPayslip.other_deductions)}`} />
              <SummaryTile label="Company Contribution" value={fmt(n(previewPayslip.epf_employer) + n(previewPayslip.socso_employer) + n(previewPayslip.eis_employer) + n(previewPayslip.other_contribution_amount))} />
              <SummaryTile label={previewPayslip.other_contribution_name || 'Other Contribution'} value={fmt(n(previewPayslip.other_contribution_amount))} />
              <SummaryTile label="Net Pay" value={fmt(previewPayslip.net_pay)} positive />
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => copyPayslip(previewPayslip)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wider dark:border-gray-700"><Copy size={14} /> Copy</button><button onClick={() => void downloadPayslipPdf(previewPayslip)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wider dark:border-gray-700"><Download size={14} /> Download PDF</button><button onClick={() => void printPayslipPdf(previewPayslip)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wider dark:border-gray-700"><FileText size={14} /> Print</button><button onClick={() => setPreviewPayslip(null)} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text' }) => {
  const [draftValue, setDraftValue] = useState(() => (type === 'number' && value === 0 ? '' : String(value)));

  useEffect(() => {
    setDraftValue(type === 'number' && value === 0 ? '' : String(value));
  }, [type, value]);

  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</label>
      <input
        type={type}
        value={type === 'number' ? draftValue : value}
        onChange={event => {
          if (type === 'number') setDraftValue(event.target.value);
          onChange(event.target.value);
        }}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      />
    </div>
  );
};

interface EpfContributionFieldProps {
  label: string;
  mode: ContributionMode;
  percentage: number;
  amount: number;
  baseAmount: number;
  currencySymbol: string;
  onModeChange: (mode: ContributionMode) => void;
  onPercentageChange: (value: number) => void;
  onAmountChange: (value: number) => void;
}

const EpfContributionField: React.FC<EpfContributionFieldProps> = ({
  label,
  mode,
  percentage,
  amount,
  baseAmount,
  currencySymbol,
  onModeChange,
  onPercentageChange,
  onAmountChange,
}) => {
  const calculatedAmount = percentageAmount(baseAmount, percentage);
  const visibleAmount = mode === 'percentage' ? calculatedAmount : n(amount);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</label>
        <div className="flex rounded-lg bg-white p-1 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {(['percentage', 'fixed'] as ContributionMode[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => onModeChange(option)}
              className={`rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition ${mode === option ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              {option === 'percentage' ? 'Percentage' : 'Fixed'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'percentage' ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={percentage || ''}
              onChange={event => onPercentageChange(n(event.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-8 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="0"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
          </div>
          <div className="min-w-28 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-right text-sm font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            {currencySymbol}{visibleAmount.toFixed(2)}
          </div>
        </div>
      ) : (
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount || ''}
          onChange={event => onAmountChange(n(event.target.value))}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="0"
        />
      )}
    </div>
  );
};

const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <div className="md:col-span-3 pt-2 first:pt-0">
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">{title}</span>
      <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
    </div>
  </div>
);

const PayrollSectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <div className="md:col-span-2 xl:col-span-4 pt-3">
    <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{title}</span>
  </div>
);

const SummaryTile: React.FC<{ label: string; value: string; positive?: boolean }> = ({ label, value, positive }) => (
  <div className={`rounded-xl p-3 ${positive ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-900'}`}>
    <p className={`text-[10px] uppercase ${positive ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</p>
    <b className={positive ? 'text-emerald-700 dark:text-emerald-300' : ''}>{value}</b>
  </div>
);

export default StaffManagementView;
