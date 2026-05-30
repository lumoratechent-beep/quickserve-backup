import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Copy, CreditCard, Download, Edit3, FileText, MoreVertical, Plus, Receipt, RotateCcw, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Restaurant } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from './Toast';
import { syncBackofficeToDb } from '../lib/sharedSettings';

type StaffRole = 'CASHIER' | 'KITCHEN' | 'ORDER_TAKER' | 'MANAGER';
type ContributionMode = 'fixed' | 'percentage';
type StaffEmploymentStatus = 'Active' | 'Probation' | 'Inactive' | 'Resigned';

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

interface OvertimeEntry {
  id: string;
  hours: number;
  multiplier: number;
}

interface Props {
  restaurant: Restaurant;
  currencySymbol: string;
}

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const percentageAmount = (base: number, percentage: number) => Number(((n(base) * n(percentage)) / 100).toFixed(2));

const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const blankOvertimeEntry = (): OvertimeEntry => ({ id: crypto.randomUUID(), hours: 0, multiplier: 1.5 });
const overtimeMultipliers = [1, 1.5, 2, 2.5, 3];

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

const StaffManagementView: React.FC<Props> = ({ restaurant, currencySymbol }) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [subTab, setSubTab] = useState<'directory' | 'payroll' | 'departments'>('directory');
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
  const [previewPayslip, setPreviewPayslip] = useState<PayrollPayslip | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [actionMenuStaffId, setActionMenuStaffId] = useState<string | null>(null);

  const fmt = (value: number) => `${currencySymbol}${n(value).toFixed(2)}`;
  const statusOptionClass = 'bg-white text-gray-900';
  const getPayFrequencyLabel = (frequency?: string | null) => (frequency === 'Monthly' || !frequency ? 'mo' : frequency);
  const getStaffStatusClass = (status: StaffEmploymentStatus) => {
    if (status === 'Active') return 'bg-emerald-100 text-emerald-700 focus:ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300';
    if (status === 'Probation') return 'bg-amber-100 text-amber-700 focus:ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300';
    return 'bg-rose-100 text-rose-700 focus:ring-rose-300 dark:bg-rose-500/20 dark:text-rose-300';
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
      .in('role', ['CASHIER', 'KITCHEN', 'ORDER_TAKER', 'MANAGER']);

    if (usersError) {
      toast(usersError.message || 'Failed to load staff', 'error');
      return;
    }

    const [deptRes, profileRes, payslipRes] = await Promise.all([
      supabase.from('staff_departments').select('*').eq('restaurant_id', restaurant.id).order('name', { ascending: true }),
      supabase.from('staff_profiles').select('*').eq('restaurant_id', restaurant.id),
      supabase.from('payroll_payslips').select('*').eq('restaurant_id', restaurant.id).order('pay_date', { ascending: false }),
    ]);

    if (deptRes.error || profileRes.error || payslipRes.error) {
      console.warn('Apply migration 038_staff_hr_payroll.sql to enable HR/payroll tables.', { deptRes, profileRes, payslipRes });
    }

    const profileByUser = new Map(((profileRes.data || []) as StaffProfile[]).map(profile => [profile.user_id, profile]));
    const mapped = (usersData || []).map((user: any) => ({
      ...user,
      role: user.role as StaffRole,
      profile: profileByUser.get(user.id),
    })) as StaffMember[];

    setDepartments((deptRes.data || []) as StaffDepartment[]);
    setPayslips((payslipRes.data || []) as PayrollPayslip[]);
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
    setPayrollForm(blankPayrollForm());
    resetEpfContributionModes();
    setOvertimeRate(0);
    setOvertimeEntries([blankOvertimeEntry()]);
    setIsOvertimeOpen(false);
    if (item) applyPayrollTemplate(item);
    setIsPayslipFormOpen(true);
  };

  const copyPayslip = (payslip: PayrollPayslip) => {
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
      payPeriod: monthLabel(),
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
      const id = crypto.randomUUID();
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

      const { error } = await supabase.from('payroll_payslips').insert({ ...row, updated_at: new Date().toISOString() });
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
      setIsPayslipFormOpen(false);
      setPreviewPayslip(row);
      await refresh(false);
      toast('Payslip saved and synced to expenses', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save payslip', 'error');
    } finally {
      setIsSavingPayslip(false);
    }
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

  const selectedPreviewStaff = previewPayslip ? staff.find(item => item.id === previewPayslip.staff_user_id) : null;
  const renderModalPortal = (node: React.ReactNode) => (typeof document === 'undefined' ? node : createPortal(node, document.body));

  const fieldClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400';

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm dark:border-amber-900/30 dark:from-gray-900 dark:via-gray-800 dark:to-amber-950/20">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="min-w-0">
        <div className="relative flex gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['directory', 'Staff Directory', <Users size={14} />],
            ['payroll', 'Staff Payslip', <Receipt size={14} />],
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
              <table className="w-full min-w-[940px] text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="w-[30%] min-w-[260px] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Staff</th>
                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Department</th>
                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Login Role</th>
                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Salary</th>
                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Contact</th>
                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                    <th className="w-12 px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {visibleStaff.map(item => {
                    const department = departments.find(dept => dept.id === item.profile?.department_id);
                    const currentStatus = (item.profile?.employment_status || (item.is_active === false ? 'Inactive' : 'Active')) as StaffEmploymentStatus;
                    return (
                      <tr key={item.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="w-[30%] min-w-[260px] px-5 py-4">
                          <div>
                            <p className="text-sm font-black text-gray-900 dark:text-white">{item.profile?.full_name || item.username}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.profile?.employee_code || item.username}</p>
                            {item.profile?.nationality && <p className="mt-1 text-[10px] font-semibold text-gray-400">Citizen: {item.profile.nationality}</p>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{department?.name || 'Unassigned'}</p><p>{item.profile?.job_title || 'No job title'}</p></td>
                        <td className="px-5 py-4"><span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-700 dark:text-gray-300">{item.role}</span></td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{fmt(n(item.profile?.salary_amount))} <span className="font-normal text-gray-400">/{getPayFrequencyLabel(item.profile?.pay_frequency)}</span></td>
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
                        <td className="relative w-12 px-2 py-4 text-center">
                          {actionMenuStaffId === item.id && <button type="button" aria-label="Close staff actions" className="fixed inset-0 z-10 cursor-default" onClick={() => setActionMenuStaffId(null)} />}
                          <div className="relative flex justify-center">
                            <button
                              type="button"
                              onClick={() => setActionMenuStaffId(openId => openId === item.id ? null : item.id)}
                              className={`relative z-20 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white ${actionMenuStaffId === item.id ? 'invisible' : ''}`}
                              title="Staff actions"
                              aria-label={`Actions for ${item.profile?.full_name || item.username}`}
                              aria-expanded={actionMenuStaffId === item.id}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {actionMenuStaffId === item.id && (
                              <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
                                <button type="button" onClick={() => { setActionMenuStaffId(null); openStaffModal(item); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-amber-50 hover:text-amber-700 dark:text-gray-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-300">
                                  <Edit3 size={14} /> Edit Profile
                                </button>
                                <button type="button" onClick={() => { setActionMenuStaffId(null); setSubTab('payroll'); openPayslipForm(item); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-gray-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300">
                                  <Receipt size={14} /> Make a Payslip
                                </button>
                                <button type="button" onClick={() => { setActionMenuStaffId(null); deleteStaff(item); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20">
                                  <Trash2 size={14} /> Remove
                                </button>
                              </div>
                            )}
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

        {subTab === 'payroll' && (
        isPayslipFormOpen ? (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">Staff Payslip</h3>
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
                  <Field label="Pay Period" value={payrollForm.payPeriod} onChange={value => setPayrollForm(form => ({ ...form, payPeriod: value }))} />
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
              <button onClick={() => setIsPayslipFormOpen(false)} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Back to List</button>
              <button onClick={savePayslip} disabled={isSavingPayslip || !payrollForm.staffUserId} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-40">{isSavingPayslip ? 'Saving...' : 'Save Payslip'}</button>
            </div>
          </div>
        ) : (
          <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">Staff Payslip</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review saved payslips and create a new staff payroll record.</p>
              </div>
              <button onClick={() => openPayslipForm()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
                <Plus size={14} /> Create Payslip
              </button>
            </div>
            {payslips.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>{['Staff', 'Pay Period', 'Gross Pay', 'Deductions', 'Net Pay', 'Status', 'Actions'].map(head => <th key={head} className={`px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 ${head === 'Actions' ? 'text-center' : ''}`}>{head}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {payslips.map(payslip => {
                      const item = staff.find(staffItem => staffItem.id === payslip.staff_user_id);
                      const deductions = n(payslip.epf_employee) + n(payslip.socso_employee) + n(payslip.eis_employee) + n(payslip.tax_pcb) + n(payslip.unpaid_leave_deduction) + n(payslip.other_deductions);
                      return (
                        <tr key={payslip.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-700/30">
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
                            <div className="flex justify-center gap-1">
                              <button onClick={() => setPreviewPayslip(payslip)} className="rounded-lg p-2 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20" title="Review payslip"><FileText size={14} /></button>
                              <button onClick={() => copyPayslip(payslip)} className="rounded-lg p-2 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20" title="Copy payslip"><Copy size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-gray-400 dark:text-gray-600"><FileText size={40} className="mb-3 opacity-30" /><p className="text-sm font-bold">No payslips found</p><button onClick={() => openPayslipForm()} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Create Payslip</button></div>
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

      {staffModalOpen && renderModalPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setStaffModalOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-gray-900 dark:text-white">{editingStaffId ? 'Edit Staff Profile' : 'Add Staff Profile'}</h3><p className="text-xs text-gray-500 dark:text-gray-400">Account login, department, employment, salary and statutory details.</p></div><button onClick={() => setStaffModalOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SectionDivider title="User Access" />
              <Field label="Username *" value={staffForm.username} onChange={value => setStaffForm(form => ({ ...form, username: value }))} />
              <Field label={editingStaffId ? 'Password (leave blank)' : 'Password *'} type="password" value={staffForm.password} onChange={value => setStaffForm(form => ({ ...form, password: value }))} />
              <div><label className={labelClass}>Role</label><select value={staffForm.role} onChange={event => setStaffForm(form => ({ ...form, role: event.target.value as StaffRole }))} className={fieldClass}><option value="CASHIER">Cashier</option><option value="KITCHEN">Kitchen</option><option value="ORDER_TAKER">Order Taker</option><option value="MANAGER">Manager</option></select></div>
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
