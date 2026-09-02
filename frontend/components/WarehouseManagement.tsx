import React, { useEffect, useState, useCallback } from 'react';
import { getApiUrl } from '../utils/apiConfig';

interface WH { id: string; line_type: string; name: string; city: string; is_active: boolean; }
interface AS { id: string; user_id: string; warehouse_id: string; user_name: string; username: string; warehouse_name: string; line_type: string; city: string; }
interface US { id: string; username: string; full_name: string; fullName?: string; name: string; role: string; }
interface City { id: string; city: string; province: string; }

const LO = [{v:'Basteni',l:'بستنی'},{v:'Pasturized',l:'پاستوریزه'},{v:'Ambient',l:'لبنیات-فروتلند'}];

const WarehouseManagement: React.FC = () => {
  const [whs, setWhs] = useState<WH[]>([]);
  const [ass, setAss] = useState<AS[]>([]);
  const [users, setUsers] = useState<US[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [load, setLoad] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [origins, setOrigins] = useState<string[]>([]);
  const [nlt, setNlt] = useState('Basteni');
  const [nc, setNc] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [showCD, setShowCD] = useState(false);
  const [auid, setAuid] = useState('');
  const [awid, setAwid] = useState('');

  const fetchData = useCallback(async()=>{try{
    const tk=localStorage.getItem('token');const h={Authorization:'Bearer '+tk};
    const wr=await fetch(getApiUrl('warehouses/all'),{headers:h});
    if(!wr.ok)throw new Error('warehouses:'+wr.status);
    setWhs(await wr.json().then(d=>Array.isArray(d)?d:[]));
    const ar=await fetch(getApiUrl('warehouses/assignments'),{headers:h});
    if(!ar.ok)throw new Error('assignments:'+ar.status);
    setAss(await ar.json().then(d=>Array.isArray(d)?d:[]));
    const ur=await fetch(getApiUrl('admin/users?limit=200'),{headers:h});
    if(!ur.ok)throw new Error('users:'+ur.status);
    setUsers(await ur.json().then(d=>Array.isArray(d)?d:(d.users||d||[])));  
    const cr=await fetch(getApiUrl('cities'),{headers:h});
    if(!cr.ok)throw new Error('cities:'+cr.status);
    setCities(await cr.json().then(d=>Array.isArray(d)?d:[]));
    const or=await fetch(getApiUrl('warehouses/origin-cities'),{headers:h});
    if(or.ok) setOrigins(await or.json().then(d=>Array.isArray(d)?d:[]));
  }catch(e:any){setErrMsg(e.message||'error');}finally{setLoad(false);}},[]);
  useEffect(()=>{fetchData();},[fetchData]);

  const tk=()=>localStorage.getItem('token');
  const hd=()=>({'Content-Type':'application/json',Authorization:'Bearer '+tk()});

  const addWH=async()=>{
    if(!nc){setErrMsg('نام انبار را وارد کنید');return;}
    try{
      const r=await fetch(getApiUrl('warehouses'),{method:'POST',headers:hd(),body:JSON.stringify({line_type:nlt,name:nc,city:nc})});
      if(!r.ok){const e=await r.json().catch(()=>({}));setErrMsg(e.message||'error:'+r.status);return;}
      setNc('');setCityQuery('');fetchData();
    }catch(e:any){setErrMsg(e.message||'error');}
  };
  const delWH=async(id:string)=>{if(!confirm('آیا غیرفعال شود؟'))return;await fetch(getApiUrl('warehouses/'+id),{method:'DELETE',headers:{Authorization:'Bearer '+tk()}});fetchData();};
  const addAS=async()=>{if(!auid||!awid)return;const r=await fetch(getApiUrl('warehouses/assignments'),{method:'POST',headers:hd(),body:JSON.stringify({user_id:auid,warehouse_id:awid})});if(!r.ok){const e=await r.json().catch(()=>({}));setErrMsg(e.message||'error');return;}setAuid('');setAwid('');fetchData();};
  const delAS=async(id:string)=>{await fetch(getApiUrl('warehouses/assignments/'+id),{method:'DELETE',headers:{Authorization:'Bearer '+tk()}});fetchData();};

  const originOptions = (origins.length ? origins : cities.map(c => c.city).filter(Boolean));
  const fc = originOptions.filter(c => c && cityQuery && c.includes(cityQuery)).slice(0,10);
  const whUsers = users.filter(u => u.role === 'warehouse_keeper');

  if(load) return <div className='text-center p-8'>در حال بارگذاری...</div>;
  return(
    <div className='max-w-6xl mx-auto p-4 space-y-6' dir='rtl'>
      <h1 className='text-xl font-bold text-slate-800'>مدیریت انبارها</h1>
      {errMsg && <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm flex justify-between'><span>{errMsg}</span><button onClick={()=>setErrMsg('')} className='text-red-400'>خروج</button></div>}
      <div className='bg-white rounded-lg border p-4'>
        <h2 className='font-bold text-slate-700 mb-3'>لیست انبارها</h2>
        <div className='flex items-end gap-3 mb-4 flex-wrap'>
          <div><label className='block text-xs text-slate-500 mb-1'>لاین</label><select value={nlt} onChange={e=>setNlt(e.target.value)} className='border rounded px-2 py-1.5 text-sm'>{LO.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
          <div className='relative'><label className='block text-xs text-slate-500 mb-1'>نام انبار</label>
            <input value={cityQuery} onChange={e=>{setCityQuery(e.target.value);setNc(e.target.value);setShowCD(true);}} onFocus={()=>setShowCD(true)} onBlur={()=>setTimeout(()=>setShowCD(false),200)} className='border rounded px-2 py-1.5 text-sm w-56' placeholder='از مبدأ اعلام بار انتخاب کنید...' />
            {showCD && fc.length > 0 && (
              <div className='absolute z-10 bg-white border rounded shadow-lg mt-1 w-full max-h-48 overflow-y-auto'>
                {fc.map(c => (<div key={c} className='px-3 py-1.5 text-sm hover:bg-sky-50 cursor-pointer' onMouseDown={()=>{setNc(c);setCityQuery(c);setShowCD(false);}}>{c}</div>))}
              </div>
            )}
          </div>
          <button onClick={addWH} className='bg-sky-600 text-white px-4 py-1.5 rounded text-sm hover:bg-sky-700'>+ اضافه</button>
        </div>
        {whs.length===0?<p className='text-sm text-slate-400'>هنوز انباری نیست.</p>:(
        <table className='w-full text-sm'><thead><tr className='border-b text-slate-500'>
          <th className='text-right py-2 px-2'>#</th><th className='text-right py-2 px-2'>لاین</th><th className='text-right py-2 px-2'>نام</th><th className='text-right py-2 px-2'>شهر</th><th className='text-right py-2 px-2'>وضعیت</th><th className='py-2 px-2'></th>
        </tr></thead><tbody>
        {whs.map((w,i)=>(<tr key={w.id} className='border-b hover:bg-slate-50'><td className='py-2 px-2'>{i+1}</td><td className='py-2 px-2'>{LO.find(o=>o.v===w.line_type)?.l||w.line_type}</td><td className='py-2 px-2 font-medium'>{w.name}</td><td className='py-2 px-2'>{w.city}</td><td className='py-2 px-2'><span className={w.is_active?'text-green-600':'text-red-400'}>{w.is_active?'فعال':'غیرفعال'}</span></td><td className='py-2 px-2'>{w.is_active&&<button onClick={()=>delWH(w.id)} className='text-red-400 hover:text-red-600 text-xs'>غیرفعال</button>}</td></tr>))}
        </tbody></table>)}</div>

      <div className='bg-white rounded-lg border p-4'>
        <h2 className='font-bold text-slate-700 mb-3'>تخصیص انباردار به انبار</h2>
        <div className='flex items-end gap-3 mb-4 flex-wrap'>
          <div><label className='block text-xs text-slate-500 mb-1'>کاربر (انباردار)</label><select value={auid} onChange={e=>setAuid(e.target.value)} className='border rounded px-2 py-1.5 text-sm min-w-[200px]'><option value=''>انتخاب</option>{whUsers.map(u=>(<option key={u.id} value={u.id}>{u.fullName||u.full_name||u.name||u.username}</option>))}</select></div>
          <div><label className='block text-xs text-slate-500 mb-1'>انبار</label><select value={awid} onChange={e=>setAwid(e.target.value)} className='border rounded px-2 py-1.5 text-sm min-w-[200px]'><option value=''>انتخاب</option>{whs.filter(w=>w.is_active).map(w=>(<option key={w.id} value={w.id}>{w.name} ({LO.find(o=>o.v===w.line_type)?.l})</option>))}</select></div>
          <button onClick={addAS} className='bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700'>+ تخصیص</button>
        </div>
        {ass.length===0?<p className='text-sm text-slate-400'>هنوز تخصیصی نیست.</p>:(
        <table className='w-full text-sm'><thead><tr className='border-b text-slate-500'>
          <th className='text-right py-2 px-2'>کاربر</th><th className='text-right py-2 px-2'>نام کاربری</th><th className='text-right py-2 px-2'>انبار</th><th className='text-right py-2 px-2'>لاین</th><th className='text-right py-2 px-2'>شهر</th><th className='py-2 px-2'></th>
        </tr></thead><tbody>
        {ass.map(a=>(<tr key={a.id} className='border-b hover:bg-slate-50'><td className='py-2 px-2'>{a.user_name}</td><td className='py-2 px-2 text-slate-500'>{a.username}</td><td className='py-2 px-2 font-medium'>{a.warehouse_name}</td><td className='py-2 px-2'>{LO.find(o=>o.v===a.line_type)?.l||a.line_type}</td><td className='py-2 px-2'>{a.city}</td><td className='py-2 px-2'><button onClick={()=>delAS(a.id)} className='text-red-400 hover:text-red-600 text-xs'>حذف</button></td></tr>))}
        </tbody></table>)}</div>
    </div>
  );
};

export default WarehouseManagement;
