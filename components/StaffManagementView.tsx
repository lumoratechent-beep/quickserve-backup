import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle, CreditCard, Edit3, FileText, Plus, Receipt, RotateCcw, Search, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { Restaurant } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from './Toast';
import { syncBackofficeToDb } from '../lib/sharedSettings';

type StaffRole = 'CASHIER' | 'KITCHEN' | 'ORDER_TAKER' | 'MANAGER';

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
  tax_pcb: number;
  unpaid_leave_deduction: number;
  other_deductions: number;
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
  taxPcb: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  paymentMethod: string;
  status: 'draft' | 'approved' | 'paid';
  notes: string;
}

interface Props {
  restaurant: Restaurant;
  currencySymbol: string;
}

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
  taxPcb: 0,
  unpaidLeaveDeduction: 0,
  otherDeductions: 0,
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
  const [payrollForm, setPayrollForm] = useState<PayrollForm>(() => blankPayrollForm());
  const [isSavingPayslip, setIsSavingPayslip] = useState(false);
  const [previewPayslip, setPreviewPayslip] = useState<PayrollPayslip | null>(null);

  const fmt = (value: number) => `${currencySymbol}${n(value).toFixed(2)}`;

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

  const toggleStaffActive = async (item: StaffMember) => {
    const nextActive = item.is_active === false;
    const { error } = await supabase.from('users').update({ is_active: nextActive }).eq('id', item.id);
    if (error) {
      toast(error.message || 'Failed to update staff', 'error');
      return;
    }
    cacheStaff(staff.map(staffItem => staffItem.id === item.id ? { ...staffItem, is_active: nextActive } : staffItem));
    toast(`${item.username} ${nextActive ? 'activated' : 'deactivated'}`, 'success');
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

  const applyPayrollTemplate = (item: StaffMember) => {
    const salary = n(item.profile?.salary_amount);
    const allowance = n(item.profile?.default_allowances?.fixed);
    const deduction = n(item.profile?.default_deductions?.fixed);
    setPayrollForm(prev => ({
      ...prev,
      staffUserId: item.id,
      basicSalary: salary,
      allowanceAmount: allowance,
      otherDeductions: deduction,
      epfEmployee: Number((salary * 0.11).toFixed(2)),
      epfEmployer: Number((salary * 0.13).toFixed(2)),
      socsoEmployee: Number((salary * 0.005).toFixed(2)),
      eisEmployee: Number((salary * 0.002).toFixed(2)),
    }));
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
        tax_pcb: n(payrollForm.taxPcb),
        unpaid_leave_deduction: n(payrollForm.unpaidLeaveDeduction),
        other_deductions: n(payrollForm.otherDeductions),
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
      setPreviewPayslip(row);
      await refresh(false);
      toast('Payslip saved and synced to expenses', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save payslip', 'error');
    } finally {
      setIsSavingPayslip(false);
    }
  };

  const selectedPreviewStaff = previewPayslip ? staff.find(item => item.id === previewPayslip.staff_user_id) : null;

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
            <button onClick={() => openStaffModal()} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
              <UserPlus size={14} /> Add Staff
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
        {([
          ['directory', 'Staff Directory', <Users size={14} />],
          ['payroll', 'Payslip Maker', <Receipt size={14} />],
          ['departments', 'Departments', <Building2 size={14} />],
        ] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setSubTab(key)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${subTab === key ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {subTab === 'directory' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Employee Records</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Login credentials are linked to employee profiles, departments and salary setup.</p>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white md:w-72" />
            </div>
          </div>
          {visibleStaff.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>{['Staff', 'Department', 'Login Role', 'Salary', 'Contact', 'Status', 'Actions'].map(head => <th key={head} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">{head}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {visibleStaff.map(item => {
                    const department = departments.find(dept => dept.id === item.profile?.department_id);
                    return (
                      <tr key={item.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-sm font-black text-amber-700 dark:bg-amber-600/20 dark:text-amber-300">{(item.profile?.full_name || item.username).charAt(0).toUpperCase()}</div>
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white">{item.profile?.full_name || item.username}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.profile?.employee_code || item.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p className="font-bold text-gray-700 dark:text-gray-200">{department?.name || 'Unassigned'}</p><p>{item.profile?.job_title || 'No job title'}</p></td>
                        <td className="px-5 py-4"><span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600 dark:bg-gray-700 dark:text-gray-300">{item.role}</span></td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{fmt(n(item.profile?.salary_amount))} <span className="font-normal text-gray-400">/{item.profile?.pay_frequency || 'Monthly'}</span></td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400"><p>{item.email || '-'}</p><p>{item.phone || '-'}</p></td>
                        <td className="px-5 py-4"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${item.is_active !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'}`}>{item.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openStaffModal(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20" title="Edit profile"><Edit3 size={14} /></button>
                            <button onClick={() => { setSubTab('payroll'); applyPayrollTemplate(item); }} className="rounded-lg p-2 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20" title="Make payslip"><Receipt size={14} /></button>
                            <button onClick={() => toggleStaffActive(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white" title="Toggle active">{item.is_active !== false ? <UserMinus size={14} /> : <CheckCircle size={14} />}</button>
                            <button onClick={() => deleteStaff(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20" title="Remove"><Trash2 size={14} /></button>
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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5"><h3 className="text-sm font-black text-gray-900 dark:text-white">Payslip Maker</h3><p className="text-xs text-gray-500 dark:text-gray-400">Editable payroll fields: EPF, SOCSO, EIS, PCB tax, allowances and deductions.</p></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Staff</label>
                <select value={payrollForm.staffUserId} onChange={event => { const selected = staff.find(item => item.id === event.target.value); if (selected) applyPayrollTemplate(selected); else setPayrollForm(form => ({ ...form, staffUserId: '' })); }} className={fieldClass}>
                  <option value="">Select staff</option>
                  {staff.map(item => <option key={item.id} value={item.id}>{item.profile?.full_name || item.username} ({item.role})</option>)}
                </select>
              </div>
              <Field label="Pay Period" value={payrollForm.payPeriod} onChange={value => setPayrollForm(form => ({ ...form, payPeriod: value }))} />
              <Field label="Pay Date" type="date" value={payrollForm.payDate} onChange={value => setPayrollForm(form => ({ ...form, payDate: value }))} />
              {([
                ['basicSalary', 'Basic Salary'], ['overtimeAmount', 'Overtime'], ['allowanceAmount', 'Allowances'], ['bonusAmount', 'Bonus'], ['epfEmployee', 'EPF Employee'], ['epfEmployer', 'EPF Employer'], ['socsoEmployee', 'SOCSO'], ['eisEmployee', 'EIS'], ['taxPcb', 'PCB / Tax'], ['unpaidLeaveDeduction', 'Unpaid Leave'], ['otherDeductions', 'Other Deductions'],
              ] as const).map(([key, label]) => (
                <Field key={key} label={label} type="number" value={payrollForm[key]} onChange={value => setPayrollForm(form => ({ ...form, [key]: n(value) }))} />
              ))}
              <div><label className={labelClass}>Payment Method</label><select value={payrollForm.paymentMethod} onChange={event => setPayrollForm(form => ({ ...form, paymentMethod: event.target.value }))} className={fieldClass}><option>Bank Transfer</option><option>Cash</option><option>Cheque</option></select></div>
              <div><label className={labelClass}>Status</label><select value={payrollForm.status} onChange={event => setPayrollForm(form => ({ ...form, status: event.target.value as PayrollForm['status'] }))} className={fieldClass}><option value="draft">Draft</option><option value="approved">Approved</option><option value="paid">Paid</option></select></div>
              <div className="md:col-span-2"><label className={labelClass}>Notes</label><textarea value={payrollForm.notes} onChange={event => setPayrollForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[80px]`} /></div>
            </div>
            <div className="mt-5 flex justify-end"><button onClick={savePayslip} disabled={isSavingPayslip || !payrollForm.staffUserId} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-40">{isSavingPayslip ? 'Saving...' : 'Save Payslip'}</button></div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-sm font-black text-gray-900 dark:text-white">Payroll Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Gross Pay</span><b>{fmt(payrollTotals.gross)}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">Employee Deductions</span><b className="text-rose-500">-{fmt(payrollTotals.deductions)}</b></div>
                <div className="border-t border-gray-200 pt-3 dark:border-gray-700"><div className="flex justify-between text-lg"><span className="font-black">Net Pay</span><b className="text-emerald-600 dark:text-emerald-400">{fmt(payrollTotals.net)}</b></div><p className="mt-1 text-[10px] text-gray-400">Employer EPF tracked separately: {fmt(payrollForm.epfEmployer)}</p></div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-sm font-black text-gray-900 dark:text-white">Recent Payslips</h3>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {payslips.length ? payslips.map(payslip => {
                  const item = staff.find(staffItem => staffItem.id === payslip.staff_user_id);
                  return <button key={payslip.id} onClick={() => setPreviewPayslip(payslip)} className="w-full rounded-xl border border-gray-100 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50 dark:border-gray-700 dark:hover:bg-amber-900/10"><div className="flex justify-between gap-3"><div><p className="text-xs font-black text-gray-900 dark:text-white">{item?.profile?.full_name || item?.username || 'Staff'}</p><p className="text-[10px] text-gray-400">{payslip.pay_period} - {payslip.status}</p></div><b className="text-sm text-emerald-600 dark:text-emerald-400">{fmt(payslip.net_pay)}</b></div></button>;
                }) : <p className="text-xs text-gray-400">No payslips generated yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'departments' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[420px_1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Add Department</h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Departments connect employees to branches, job groups or kitchen sections.</p>
            <div className="space-y-3">
              <input value={departmentName} onChange={event => setDepartmentName(event.target.value)} placeholder="Department name" className={fieldClass} />
              <input value={departmentCode} onChange={event => setDepartmentCode(event.target.value)} placeholder="Code, e.g. FOH" className={fieldClass} />
              <button onClick={addDepartment} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Save Department</button>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-sm font-black text-gray-900 dark:text-white">Departments</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {departments.length ? departments.map(department => <div key={department.id} className="rounded-xl border border-gray-100 p-4 dark:border-gray-700"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-gray-900 dark:text-white">{department.name}</p><p className="text-xs text-gray-400">{department.code || 'No code'}</p></div><span className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{staff.filter(item => item.profile?.department_id === department.id).length} staff</span></div></div>) : <p className="text-xs text-gray-400">No departments yet.</p>}
            </div>
          </div>
        </div>
      )}

      {staffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setStaffModalOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-gray-900 dark:text-white">{editingStaffId ? 'Edit Staff Profile' : 'Add Staff Profile'}</h3><p className="text-xs text-gray-500 dark:text-gray-400">Account login, department, employment, salary and statutory details.</p></div><button onClick={() => setStaffModalOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Username *" value={staffForm.username} onChange={value => setStaffForm(form => ({ ...form, username: value }))} />
              <Field label={editingStaffId ? 'Password (leave blank)' : 'Password *'} type="password" value={staffForm.password} onChange={value => setStaffForm(form => ({ ...form, password: value }))} />
              <div><label className={labelClass}>Role</label><select value={staffForm.role} onChange={event => setStaffForm(form => ({ ...form, role: event.target.value as StaffRole }))} className={fieldClass}><option value="CASHIER">Cashier</option><option value="KITCHEN">Kitchen</option><option value="ORDER_TAKER">Order Taker</option><option value="MANAGER">Manager</option></select></div>
              <Field label="Full Name" value={staffForm.fullName} onChange={value => setStaffForm(form => ({ ...form, fullName: value }))} />
              <Field label="Employee Code" value={staffForm.employeeCode} onChange={value => setStaffForm(form => ({ ...form, employeeCode: value }))} />
              <div><label className={labelClass}>Department</label><select value={staffForm.departmentId} onChange={event => setStaffForm(form => ({ ...form, departmentId: event.target.value }))} className={fieldClass}><option value="">Unassigned</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
              <Field label="Job Title" value={staffForm.jobTitle} onChange={value => setStaffForm(form => ({ ...form, jobTitle: value }))} />
              <Field label="Email" value={staffForm.email} onChange={value => setStaffForm(form => ({ ...form, email: value }))} />
              <Field label="Phone" value={staffForm.phone} onChange={value => setStaffForm(form => ({ ...form, phone: value }))} />
              <Field label="IC / Passport" value={staffForm.icNumber} onChange={value => setStaffForm(form => ({ ...form, icNumber: value }))} />
              <div><label className={labelClass}>Employment Type</label><select value={staffForm.employmentType} onChange={event => setStaffForm(form => ({ ...form, employmentType: event.target.value }))} className={fieldClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></div>
              <div><label className={labelClass}>Status</label><select value={staffForm.employmentStatus} onChange={event => setStaffForm(form => ({ ...form, employmentStatus: event.target.value }))} className={fieldClass}><option>Active</option><option>Probation</option><option>Inactive</option><option>Resigned</option></select></div>
              <Field label="Hire Date" type="date" value={staffForm.hireDate} onChange={value => setStaffForm(form => ({ ...form, hireDate: value }))} />
              <Field label="Basic Salary" type="number" value={staffForm.salaryAmount} onChange={value => setStaffForm(form => ({ ...form, salaryAmount: n(value) }))} />
              <div><label className={labelClass}>Pay Frequency</label><select value={staffForm.payFrequency} onChange={event => setStaffForm(form => ({ ...form, payFrequency: event.target.value }))} className={fieldClass}><option>Monthly</option><option>Weekly</option><option>Daily</option></select></div>
              <Field label="OT Rate" type="number" value={staffForm.overtimeRate} onChange={value => setStaffForm(form => ({ ...form, overtimeRate: n(value) }))} />
              <Field label="Default Allowance" type="number" value={staffForm.defaultAllowance} onChange={value => setStaffForm(form => ({ ...form, defaultAllowance: n(value) }))} />
              <Field label="Default Deduction" type="number" value={staffForm.defaultDeduction} onChange={value => setStaffForm(form => ({ ...form, defaultDeduction: n(value) }))} />
              <Field label="Bank Name" value={staffForm.bankName} onChange={value => setStaffForm(form => ({ ...form, bankName: value }))} />
              <Field label="Bank Account" value={staffForm.bankAccountNo} onChange={value => setStaffForm(form => ({ ...form, bankAccountNo: value }))} />
              <Field label="EPF No." value={staffForm.epfNo} onChange={value => setStaffForm(form => ({ ...form, epfNo: value }))} />
              <Field label="SOCSO No." value={staffForm.socsoNo} onChange={value => setStaffForm(form => ({ ...form, socsoNo: value }))} />
              <Field label="Tax No." value={staffForm.taxNo} onChange={value => setStaffForm(form => ({ ...form, taxNo: value }))} />
              <Field label="Emergency Name" value={staffForm.emergencyContactName} onChange={value => setStaffForm(form => ({ ...form, emergencyContactName: value }))} />
              <Field label="Emergency Phone" value={staffForm.emergencyContactPhone} onChange={value => setStaffForm(form => ({ ...form, emergencyContactPhone: value }))} />
              <div className="md:col-span-3"><label className={labelClass}>Address</label><textarea value={staffForm.address} onChange={event => setStaffForm(form => ({ ...form, address: event.target.value }))} className={`${fieldClass} min-h-[70px]`} /></div>
              <div className="md:col-span-3"><label className={labelClass}>Notes</label><textarea value={staffForm.notes} onChange={event => setStaffForm(form => ({ ...form, notes: event.target.value }))} className={`${fieldClass} min-h-[70px]`} /></div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setStaffModalOpen(false)} className="rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button><button onClick={saveStaff} disabled={isSavingStaff} className="rounded-xl bg-amber-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 disabled:opacity-50">{isSavingStaff ? 'Saving...' : 'Save Staff'}</button></div>
          </div>
        </div>
      )}

      {previewPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewPayslip(null)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600">Payslip</p><h3 className="text-xl font-black text-gray-900 dark:text-white">{selectedPreviewStaff?.profile?.full_name || selectedPreviewStaff?.username || 'Staff'}</h3><p className="text-xs text-gray-500">{previewPayslip.pay_period} - {new Date(previewPayslip.pay_date).toLocaleDateString()}</p></div><button onClick={() => setPreviewPayslip(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <SummaryTile label="Basic" value={fmt(previewPayslip.basic_salary)} />
              <SummaryTile label="Gross" value={fmt(previewPayslip.gross_pay)} />
              <SummaryTile label="EPF Employee" value={`-${fmt(previewPayslip.epf_employee)}`} />
              <SummaryTile label="SOCSO / EIS" value={`-${fmt(n(previewPayslip.socso_employee) + n(previewPayslip.eis_employee))}`} />
              <SummaryTile label="Tax / PCB" value={`-${fmt(previewPayslip.tax_pcb)}`} />
              <SummaryTile label="Net Pay" value={fmt(previewPayslip.net_pay)} positive />
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wider dark:border-gray-700"><FileText size={14} /> Print</button><button onClick={() => setPreviewPayslip(null)} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Close</button></div>
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

const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</label>
    <input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
  </div>
);

const SummaryTile: React.FC<{ label: string; value: string; positive?: boolean }> = ({ label, value, positive }) => (
  <div className={`rounded-xl p-3 ${positive ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-900'}`}>
    <p className={`text-[10px] uppercase ${positive ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</p>
    <b className={positive ? 'text-emerald-700 dark:text-emerald-300' : ''}>{value}</b>
  </div>
);

export default StaffManagementView;
