import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useRoute } from 'wouter';
import {
  useGetAuthStatus, getGetAuthStatusQueryKey, useSetupPassword, useLogin, useLogout,
  useHealthCheck, useGetDashboard, getGetDashboardQueryKey,
  useGetSites, getGetSitesQueryKey, useCreateSite, useGetSite, getGetSiteQueryKey,
  useUpdateSite, useDeleteSite, useGetCounterparties, getGetCounterpartiesQueryKey,
  useCreateCounterparty, useUpdateCounterparty, useDeleteCounterparty,
  useGetSalesInvoices, getGetSalesInvoicesQueryKey, useCreateSalesInvoice, useGetSalesInvoice,
  getGetSalesInvoiceQueryKey, useUpdateSalesInvoice, useDeleteSalesInvoice, useCreateReceipt, useDeleteReceipt,
  useGetPurchaseBills, getGetPurchaseBillsQueryKey, useCreatePurchaseBill, useUpdatePurchaseBill,
  useDeletePurchaseBill, useCreateSupplierPayment, useDeleteSupplierPayment,
  useGetSiteFinances, getGetSiteFinancesQueryKey, useGetCashflow, getGetCashflowQueryKey,
  useExportCsv, getExportCsvQueryKey,
} from '@workspace/api-client-react';
import type {
  Site, Counterparty, SalesInvoice, PurchaseBill, SiteInput, CounterpartyInput,
  SalesInvoiceInput, PurchaseBillInput, InvoiceLineInput, SiteFinance,
} from '@workspace/api-client-react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CircleHelp,
  Download, FileDown, FileText, HardHat, LayoutDashboard, LogOut, Menu, Plus, Search,
  ShieldCheck, Users, WalletCards, X, Wrench, AlertCircle, Trash2, Pencil, ReceiptText,
} from 'lucide-react';

const queryClient = new QueryClient();
const nav = [
  { href: '/', label: 'ホーム', icon: LayoutDashboard },
  { href: '/sites', label: '現場', icon: HardHat },
  { href: '/counterparties', label: '取引先', icon: Users },
  { href: '/sales', label: '請求・入金', icon: ArrowDownLeft },
  { href: '/purchases', label: '仕入・支払', icon: ArrowUpRight },
  { href: '/cashflow', label: '資金繰り', icon: WalletCards },
  { href: '/export', label: 'データ出力', icon: FileDown },
];
const yen = (n?: number | null) => `¥${Math.round(Number(n || 0)).toLocaleString('ja-JP')}`;
const today = () => localIso(new Date());
const dateLabel = (v?: string | null) => v ? new Date(`${v.slice(0,10)}T00:00:00`).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric' }) : '未設定';
const inputDate = (v?: string | null) => v ? v.slice(0,10) : today();
const errorText = (e: unknown) => e instanceof Error ? e.message : '通信に失敗しました。時間をおいて再度お試しください。';
function readRecent(key:string):{siteId?:number;counterpartyId?:number;taxRates?:number[]} {try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}}
function saveRecent(key:string,value:{siteId:number;counterpartyId:number;taxRates:number[]}) {try{localStorage.setItem(key,JSON.stringify(value))}catch{}}

function App() {
  useHealthCheck();
  const auth = useGetAuthStatus();
  if (auth.isLoading) return <div className="auth-loading"><div className="loading-mark"><HardHat size={24}/></div><span>現場収支を準備しています</span></div>;
  if (auth.isError) return <div className="auth-loading"><AlertCircle/><p>接続できませんでした</p><button className="button button-primary" onClick={() => auth.refetch()}>再試行</button></div>;
  if (!auth.data?.authenticated) return <AuthPage configured={!!auth.data?.configured} onDone={() => queryClient.invalidateQueries({queryKey:getGetAuthStatusQueryKey()})}/>;
  return <Workspace onLogout={() => queryClient.invalidateQueries({queryKey:getGetAuthStatusQueryKey()})}/>;
}

function AuthPage({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const setup = useSetupPassword(); const login = useLogin();
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const mutation = configured ? login : setup;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!configured && password !== confirm) return;
    mutation.mutate({data:{password}}, {onSuccess:onDone});
  };
  return <main className="auth-screen">
    <div className="auth-brand"><div className="brand-mark"><HardHat size={22}/></div><span>現場収支</span></div>
    <section className="auth-card">
      <div className="eyebrow">FIELD NOTEBOOK / 01</div>
      <h1>{configured ? 'おかえりなさい' : '最初の準備'}</h1>
      <p>{configured ? 'パスワードを入力して、現場の収支を確認しましょう。' : 'この端末で使うパスワードを設定します。10文字以上で入力してください。'}</p>
      <form onSubmit={submit} className="stack-form">
        <label>パスワード<input data-testid="input-password" type="password" required minLength={10} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={configured?'current-password':'new-password'} /></label>
        {!configured && <label>パスワード（確認）<input data-testid="input-password-confirm" type="password" required minLength={10} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label>}
        {(!configured && confirm && password!==confirm) && <p className="form-error">パスワードが一致しません。</p>}
        {mutation.isError && <p className="form-error">{errorText(mutation.error)}</p>}
        <button data-testid="button-auth-submit" className="button button-primary button-wide" disabled={mutation.isPending || (!configured && password!==confirm)}>{mutation.isPending?'確認しています…':configured?'ログイン':'パスワードを設定'}</button>
      </form>
      <div className="auth-note"><ShieldCheck size={16}/>データはこのアカウントで安全に管理されます</div>
    </section>
    <span className="auth-footer">現場のお金の流れを、ひとつのノートに。</span>
  </main>;
}

function Workspace({ onLogout }: { onLogout:()=>void }) {
  const [path] = useLocation(); const [mobileMenu,setMobileMenu] = useState(false);
  const logout = useLogout(); const qc=useQueryClient();
  const titles:Record<string,string> = {'/':'今日の資金予定','/sites':'現場台帳','/counterparties':'取引先','/sales':'請求・入金','/purchases':'仕入・支払','/cashflow':'資金繰り','/export':'データ出力'};
  const title=path.startsWith('/sites/')?'現場の収支':titles[path]||'現場収支';
  const doLogout=()=>logout.mutate(undefined,{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetAuthStatusQueryKey()});onLogout();}});
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu?'sidebar-open':''}`}>
      <Link href="/" className="brand-lockup" onClick={()=>setMobileMenu(false)}><span className="brand-mark"><HardHat size={21}/></span><span>現場収支<small>FIELD NOTEBOOK</small></span></Link>
      <div className="sidebar-caption">管理メニュー</div>
      <nav className="side-nav">{nav.map(item=>{const Icon=item.icon;const active=path===item.href || (item.href==='/sites'&&path.startsWith('/sites/'));return <Link key={item.href} href={item.href} data-testid={`link-nav-${item.href.replace('/','home')}`} className={`nav-link ${active?'active':''}`} onClick={()=>setMobileMenu(false)}><Icon size={18}/><span>{item.label}</span>{active&&<span className="nav-active-dot"/>}</Link>})}</nav>
      <div className="sidebar-bottom"><div className="notebook-stamp"><span className="stamp-line"/><span>現場の数字を、まっすぐに。</span></div><button className="logout-button" onClick={doLogout} disabled={logout.isPending}><LogOut size={17}/>{logout.isPending?'ログアウト中':'ログアウト'}</button></div>
    </aside>
    {mobileMenu&&<button aria-label="メニューを閉じる" className="mobile-backdrop" onClick={()=>setMobileMenu(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="icon-button menu-toggle" aria-label="メニュー" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={21}/></button><div className="breadcrumb"><span>現場収支</span><span className="crumb-slash">/</span><b>{title}</b></div><div className="topbar-right"><span className="today-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'})}</span><div className="avatar-mark">現</div></div></header>
      <div className="page-content"><Switch>
        <Route path="/" component={DashboardPage}/>
        <Route path="/sites" component={SitesPage}/>
        <Route path="/sites/:id" component={SiteDetailPage}/>
        <Route path="/counterparties" component={CounterpartiesPage}/>
        <Route path="/sales" component={SalesPage}/>
        <Route path="/purchases" component={PurchasesPage}/>
        <Route path="/cashflow" component={CashflowPage}/>
        <Route path="/export" component={ExportPage}/>
        <Route><NotFound/></Route>
      </Switch></div>
    </main>
  </div>;
}

function PageHeading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function Button({children,onClick,variant='primary',testId,disabled,type='button'}:{children:ReactNode;onClick?:()=>void;variant?:'primary'|'quiet'|'danger'|'outline';testId?:string;disabled?:boolean;type?:'button'|'submit'}) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`button button-${variant}`}>{children}</button>;
}
function Panel({children,className=''}:{children:ReactNode;className?:string}) {return <section className={`panel ${className}`}>{children}</section>}
function Money({value,large=false,positive}: {value?:number|null;large?:boolean;positive?:boolean}) {return <span className={`${large?'money-large':'money'} ${positive===undefined?'':positive?'money-positive':'money-negative'}`} data-testid="text-money">{yen(value)}</span>}
function LoadingBlock(){return <div className="skeleton-list"><div/><div/><div/></div>}
function QueryState({loading,error,retry,children}:{loading:boolean;error:boolean;retry:()=>void;children:ReactNode}) {if(loading)return <LoadingBlock/>;if(error)return <div className="state-card"><AlertCircle/><b>読み込めませんでした</b><span>通信状態を確認して、もう一度お試しください。</span><Button variant="outline" onClick={retry}>再読み込み</Button></div>;return <>{children}</>}
function Empty({title,detail,action}:{title:string;detail:string;action?:ReactNode}) {return <div className="empty-state"><div className="empty-icon"><ReceiptText size={22}/></div><b>{title}</b><span>{detail}</span>{action}</div>}
function Stat({label,value,note,tone=''}:{label:string;value:number;note:string;tone?:string}) {return <div className={`stat-card ${tone}`}><span className="stat-label">{label}</span><strong>{yen(value)}</strong><span className="stat-note">{note}</span></div>}
function EventRows({events}:{events:any[]}) {return <div className="event-list">{events.map((ev:any,i)=><div className="event-row" key={`${ev.date}-${i}`} data-testid={`row-event-${i}`}><div className={`event-direction ${ev.direction==='incoming'?'in':'out'}`}>{ev.direction==='incoming'?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</div><div className="event-copy"><b>{ev.description||ev.siteName}</b><span>{dateLabel(ev.date)}・{ev.siteName}・{ev.counterpartyName}</span></div><Money value={ev.amount} positive={ev.direction==='incoming'}/></div>)}</div>}

function DashboardPage() {
  const q=useGetDashboard();const d=q.data;
  return <><PageHeading eyebrow="OVERVIEW / 今日" title="今日の資金予定" subtitle="入ってくるお金と、出ていくお金をひと目で。"/>
    <QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{d&&<div className="dashboard-layout">
      <div className="dashboard-stats"><Stat label="売掛金" value={d.receivable} note="未入金の請求合計" tone="stat-sand"/><Stat label="入金遅れ" value={d.overdueReceivable} note="確認が必要な金額" tone="stat-alert"/><Stat label="買掛金" value={d.payable} note="未払いの仕入合計" tone="stat-teal"/></div>
      <Panel className="cash-summary"><div className="panel-top"><div><div className="eyebrow">COMING UP</div><h2>近いうちのお金の動き</h2></div><Link className="text-link" href="/cashflow">資金繰りを見る <ArrowRight size={15}/></Link></div><div className="summary-bands"><div><span><ArrowDownLeft size={17}/>これから入る</span><Money value={d.upcomingIncoming} large positive/></div><div><span><ArrowUpRight size={17}/>これから出る</span><Money value={d.upcomingOutgoing} large/></div></div></Panel>
      <Panel className="events-panel"><div className="panel-top"><div><div className="eyebrow">NEXT EVENTS</div><h2>直近の予定</h2></div><span className="count-badge">{d.nextEvents?.length||0}件</span></div>{d.nextEvents?.length?<EventRows events={d.nextEvents}/>:<Empty title="予定はありません" detail="請求や仕入を登録すると、ここに表示されます。"/>}</Panel>
      <div className="quick-guide"><Wrench size={18}/><span><b>現場ごとのお金をひとつに。</b> 請求・入金・仕入・支払いを記録して、次の段取りに役立てましょう。</span><Link href="/sites">現場を確認 <ArrowRight size={15}/></Link></div>
    </div>}</QueryState>
  </>;
}

function SitesPage() {
  const q=useGetSiteFinances();const sitesQ=useGetSites();const cpQ=useGetCounterparties();const create=useCreateSite();const update=useUpdateSite();const del=useDeleteSite();const qc=useQueryClient();
  const [modal,setModal]=useState(false);const [editing,setEditing]=useState<Site|null>(null);const [search,setSearch]=useState('');
  const invalidate=()=>{qc.invalidateQueries({queryKey:getGetSitesQueryKey()});qc.invalidateQueries({queryKey:getGetSiteFinancesQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});};
  const sites=(sitesQ.data||[]).filter(s=>s.name.toLowerCase().includes(search.toLowerCase()));
  const open=(s?:Site)=>{setEditing(s||null);setModal(true)};
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const data:SiteInput={name:String(f.get('name')),clientId:f.get('clientId')?Number(f.get('clientId')):null,status:String(f.get('status')) as 'active'|'completed',contractAmount:f.get('contractAmount')?Number(f.get('contractAmount')):null,memo:String(f.get('memo')||'')||null};const done=()=>{invalidate();setModal(false)};editing?update.mutate({id:editing.id,data},{onSuccess:done}):create.mutate({data},{onSuccess:done});};
  const remove=(s:Site)=>{if(window.confirm(`「${s.name}」を削除しますか？この操作は取り消せません。`))del.mutate({id:s.id},{onSuccess:invalidate});};
  return <><PageHeading eyebrow="SITE LEDGER / 現場台帳" title="現場台帳" subtitle="現場ごとの請求・仕入と、いまの収支を確認します。" action={<Button onClick={()=>open()} testId="button-add-site"><Plus size={17}/>現場を登録</Button>}/>
    <div className="toolbar"><label className="search-box"><Search size={16}/><input aria-label="現場を検索" placeholder="現場名で検索" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="muted">{sites.length} 現場</span></div>
    <QueryState loading={q.isLoading||sitesQ.isLoading} error={q.isError||sitesQ.isError} retry={()=>{q.refetch();sitesQ.refetch()}}>{sites.length?<div className="site-grid">{sites.map(s=>{const fin=(q.data||[]).find(x=>x.siteId===s.id);return <SiteCard key={s.id} site={s} finance={fin} onEdit={()=>open(s)} onDelete={()=>remove(s)}/>})}</div>:<Empty title="現場はまだありません" detail="現場を登録すると、収支の記録を始められます。" action={<Button onClick={()=>open()}><Plus size={16}/>最初の現場を登録</Button>}/>}</QueryState>
    {modal&&<Modal title={editing?'現場を編集':'現場を登録'} onClose={()=>setModal(false)}><form className="stack-form" onSubmit={save}><label>現場名<input name="name" required maxLength={200} defaultValue={editing?.name}/></label><label>発注者<select name="clientId" defaultValue={editing?.clientId||''}><option value="">選択しない</option>{(cpQ.data||[]).filter(c=>c.isClient).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="form-row"><label>契約金額<input name="contractAmount" type="number" min="0" inputMode="numeric" defaultValue={editing?.contractAmount||''}/></label><label>状態<select name="status" defaultValue={editing?.status||'active'}><option value="active">進行中</option><option value="completed">完了</option></select></label></div><label>メモ<textarea name="memo" rows={3} defaultValue={editing?.memo||''}/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>setModal(false)}>キャンセル</Button><Button type="submit" disabled={create.isPending||update.isPending}>{editing?'変更を保存':'現場を登録'}</Button></div></form></Modal>}
  </>;
}
function SiteCard({site,finance,onEdit,onDelete}:{site:Site;finance?:SiteFinance;onEdit:()=>void;onDelete:()=>void}) {return <Panel className="site-card"><div className="site-card-head"><Link href={`/sites/${site.id}`} className="site-title"><span className="site-pin"><HardHat size={17}/></span><span><b>{site.name}</b><small>{site.clientName||'発注者未設定'}・{site.status==='active'?'進行中':'完工'}</small></span></Link><button className="icon-button" aria-label="現場を編集" onClick={onEdit}><Pencil size={16}/></button></div><div className="site-balance"><span>現場収支</span><Money value={finance?.balance??site.balance} large positive={(finance?.balance??site.balance)>=0}/></div><div className="site-card-foot"><span>契約 <b>{site.contractAmount===null?'未設定':yen(site.contractAmount)}</b></span><span>請求 <b>{yen(finance?.sales??site.salesTotal)}</b></span><span>仕入 <b>{yen(finance?.purchases??site.purchasesTotal)}</b></span><button className="text-action danger-text" onClick={onDelete} aria-label="現場を削除"><Trash2 size={15}/></button></div></Panel>}

function SiteDetailPage() {
  const [,params]=useRoute('/sites/:id');const [,setLocation]=useLocation();const id=Number(params?.id||0);const q=useGetSite(id,{query:{queryKey:getGetSiteQueryKey(id),enabled:!!id}});const del=useDeleteSite();const qc=useQueryClient();
  if(!id)return <NotFound/>;
  return <><Link className="back-link" href="/sites"><ArrowLeft size={16}/>現場台帳に戻る</Link><QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{q.data&&<><PageHeading eyebrow="SITE FINANCE / 現場の収支" title={q.data.name} subtitle={`${q.data.clientName||'発注者未設定'} ・ ${q.data.status==='active'?'進行中':'完了'}`} action={<Button variant="danger" onClick={()=>{if(confirm(`「${q.data?.name}」を削除しますか？`))del.mutate({id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetSitesQueryKey()});setLocation('/sites')}})}}><Trash2 size={16}/>現場を削除</Button>}/><div className="detail-stats"><Stat label="請求額" value={q.data.salesTotal} note="この現場の請求合計"/><Stat label="仕入額" value={q.data.purchasesTotal} note="この現場の仕入合計" tone="stat-teal"/><Stat label="現場収支" value={q.data.balance} note="請求額 − 仕入額" tone="stat-sand"/></div><div className="ledger-columns"><LedgerInvoices invoices={q.data.invoices||[]}/><LedgerPurchases bills={q.data.purchases||[]}/></div></>}</QueryState></>;
}
function LedgerInvoices({invoices}:{invoices:SalesInvoice[]}){return <Panel><div className="panel-top"><h2>請求・入金</h2><span className="count-badge">{invoices.length}件</span></div>{invoices.length?invoices.map(i=><div className="ledger-row" key={i.id}><b>{i.counterpartyName}</b><span>{dateLabel(i.issuedAt)} 発行</span><Money value={i.grossAmount}/><small>未入金 {yen(i.outstandingAmount)}</small></div>):<Empty title="請求はありません" detail="請求・入金メニューから登録できます。"/>}</Panel>}
function LedgerPurchases({bills}:{bills:PurchaseBill[]}){return <Panel><div className="panel-top"><h2>仕入・支払</h2><span className="count-badge">{bills.length}件</span></div>{bills.length?bills.map(b=><div className="ledger-row" key={b.id}><b>{b.counterpartyName}</b><span>支払期日 {dateLabel(b.dueAt)}</span><Money value={b.grossAmount}/><small>未払い {yen(b.outstandingAmount)}</small></div>):<Empty title="仕入はありません" detail="仕入・支払メニューから登録できます。"/>}</Panel>}

function CounterpartiesPage() {
  const q=useGetCounterparties();const create=useCreateCounterparty();const update=useUpdateCounterparty();const del=useDeleteCounterparty();const qc=useQueryClient();const [modal,setModal]=useState(false);const [editing,setEditing]=useState<Counterparty|null>(null);const [search,setSearch]=useState('');
  const invalidate=()=>qc.invalidateQueries({queryKey:getGetCounterpartiesQueryKey()});
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const data:CounterpartyInput={name:String(f.get('name')),isClient:f.get('isClient')==='on',isSupplier:f.get('isSupplier')==='on',closingDay:f.get('closingDay')?Number(f.get('closingDay')):null,paymentTerms:String(f.get('paymentTerms')||'')||null,memo:String(f.get('memo')||'')||null};const done=()=>{invalidate();setModal(false)};editing?update.mutate({id:editing.id,data},{onSuccess:done}):create.mutate({data},{onSuccess:done});};
  return <><PageHeading eyebrow="CONTACT BOOK / 取引先" title="取引先" subtitle="発注者・仕入先の情報をまとめて管理します。" action={<Button onClick={()=>{setEditing(null);setModal(true)}}><Plus size={17}/>取引先を登録</Button>}/>
    <div className="toolbar"><label className="search-box"><Search size={16}/><input placeholder="取引先名で検索" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="muted">{q.data?.length||0} 件</span></div>
    <QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{q.data?.filter(c=>c.name.includes(search)).length?<div className="counterparty-list">{q.data.filter(c=>c.name.includes(search)).map(c=><Panel className="counterparty-row" key={c.id}><div className="counterparty-avatar">{c.name.slice(0,1)}</div><div className="counterparty-name"><b>{c.name}</b><span>{[c.isClient?'発注者':'',c.isSupplier?'仕入先':''].filter(Boolean).join(' / ')}</span></div><div className="cp-terms">{c.paymentTerms||'支払条件未設定'}{c.closingDay&&<small>締日 {c.closingDay}日</small>}</div><div className="cp-actions"><button className="icon-button" aria-label="編集" onClick={()=>{setEditing(c);setModal(true)}}><Pencil size={16}/></button><button className="icon-button danger-text" aria-label="削除" onClick={()=>{if(confirm(`「${c.name}」を削除しますか？`))del.mutate({id:c.id},{onSuccess:invalidate})}}><Trash2 size={16}/></button></div></Panel>)}</div>:<Empty title="取引先はまだありません" detail="発注者や仕入先を登録して、入力を簡単にしましょう。" action={<Button onClick={()=>{setEditing(null);setModal(true)}}><Plus size={16}/>取引先を登録</Button>}/>}</QueryState>
    {modal&&<Modal title={editing?'取引先を編集':'取引先を登録'} onClose={()=>setModal(false)}><form className="stack-form" onSubmit={save}><label>取引先名<input name="name" required defaultValue={editing?.name}/></label><div className="check-row"><label><input type="checkbox" name="isClient" defaultChecked={editing?.isClient}/> 発注者</label><label><input type="checkbox" name="isSupplier" defaultChecked={editing?.isSupplier}/> 仕入先</label></div><div className="form-row"><label>締日<input name="closingDay" type="number" min="1" max="31" placeholder="例：末日なら31" defaultValue={editing?.closingDay||''}/></label><label>支払条件<input name="paymentTerms" placeholder="例：翌月末払い" defaultValue={editing?.paymentTerms||''}/></label></div><label>メモ<textarea name="memo" rows={3} defaultValue={editing?.memo||''}/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>setModal(false)}>キャンセル</Button><Button type="submit">{editing?'変更を保存':'登録する'}</Button></div></form></Modal>}
  </>;
}

function SalesPage() {
  const q=useGetSalesInvoices();const clients=useGetCounterparties();const sites=useGetSites();const create=useCreateSalesInvoice();const update=useUpdateSalesInvoice();const del=useDeleteSalesInvoice();const receipt=useCreateReceipt();const delReceipt=useDeleteReceipt();const qc=useQueryClient();const [show,setShow]=useState(false);const [editing,setEditing]=useState<SalesInvoice|null>(null);const [selected,setSelected]=useState<number|null>(null);const [filter,setFilter]=useState('all');
  const invalidate=(id?:number)=>{qc.invalidateQueries({queryKey:getGetSalesInvoicesQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});qc.invalidateQueries({queryKey:getGetSiteFinancesQueryKey()});if(id)qc.invalidateQueries({queryKey:getGetSiteQueryKey(id)});};
  const recent=readRecent('recent-sales');
  const active=(q.data||[]).filter(i=>filter==='all'||(filter==='outstanding'?i.outstandingAmount>0:filter==='overdue'?i.status!=='unbilled'&&!!i.expectedPaymentAt&&i.expectedPaymentAt<today()&&i.outstandingAmount>0:filter==='unbilled'?i.status==='unbilled':true));
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const data:SalesInvoiceInput={siteId:Number(f.get('siteId')),counterpartyId:Number(f.get('counterpartyId')),issuedAt:String(f.get('issuedAt')||'')||null,expectedPaymentAt:String(f.get('expectedPaymentAt')||'')||null,memo:String(f.get('memo')||'')||null,lines:lineFrom(f)};const done=()=>{saveRecent('recent-sales',{siteId:data.siteId,counterpartyId:data.counterpartyId,taxRates:data.lines.map(line=>line.taxRate)});invalidate(data.siteId);setShow(false);setEditing(null)};editing?update.mutate({id:editing.id,data},{onSuccess:done}):create.mutate({data},{onSuccess:done});};
  const addReceipt=(e:FormEvent<HTMLFormElement>,inv:SalesInvoice)=>{e.preventDefault();const f=new FormData(e.currentTarget);receipt.mutate({id:inv.id,data:{receivedAt:String(f.get('receivedAt')),amount:Number(f.get('amount')),memo:String(f.get('memo')||'')||null}},{onSuccess:()=>invalidate(inv.siteId)});};
  const selectedQ=useGetSalesInvoice(selected||0,{query:{queryKey:getGetSalesInvoiceQueryKey(selected||0),enabled:!!selected}});
  return <><PageHeading eyebrow="SALES / 請求と入金" title="請求・入金" subtitle="請求額と入金状況を追いかけます。" action={<Button onClick={()=>setShow(true)}><Plus size={17}/>請求を登録</Button>}/>
     <div className="filter-tabs">{[['all','すべて'],['unbilled','未請求'],['outstanding','未入金'],['overdue','入金遅れ']].map(([v,l])=><button key={v} className={filter===v?'selected':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>
     <QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{active.length?<div className="records-list">{active.map(inv=><Panel className="record-card" key={inv.id}><div className="record-main"><div className="record-symbol sale-symbol"><ArrowDownLeft size={18}/></div><div className="record-info"><b>{inv.counterpartyName}</b><span>{inv.siteName} ・ 発行 {dateLabel(inv.issuedAt)}</span></div><div className="record-amount"><Money value={inv.grossAmount}/><small>{inv.status==='unbilled'?'未請求':inv.outstandingAmount>0?`未入金 ${yen(inv.outstandingAmount)}`:'入金済み'}</small></div></div><div className="record-bottom"><span className={`status-pill ${inv.status==='unbilled'?'status-open':inv.outstandingAmount>0?'status-open':'status-done'}`}>{inv.status==='unbilled'?'未請求':inv.outstandingAmount>0?(inv.expectedPaymentAt&&inv.expectedPaymentAt<today()?'入金遅れ':inv.status==='partially_paid'?'一部入金':'入金待ち'):'入金済み'}</span><span className="record-due">入金予定 {dateLabel(inv.expectedPaymentAt)}</span>{inv.status!=='unbilled'&&<button className="text-link" onClick={()=>setSelected(inv.id)}>入金を記録 <ArrowRight size={14}/></button>}<button className="icon-button" aria-label="請求を編集" onClick={()=>{setEditing(inv);setShow(true)}}><Pencil size={15}/></button><button className="icon-button danger-text" aria-label="請求を削除" onClick={()=>{if(confirm('この請求を削除しますか？'))del.mutate({id:inv.id},{onSuccess:()=>invalidate(inv.siteId)})}}><Trash2 size={15}/></button></div>{inv.receipts?.length>0&&<div className="receipt-mini-list">{inv.receipts.map(r=><div key={r.id}><span>{dateLabel(r.receivedAt)} 入金</span><b>{yen(r.amount)}</b><button className="text-action danger-text" aria-label="入金記録を削除" onClick={()=>{if(confirm('この入金記録を削除しますか？'))delReceipt.mutate({id:r.id},{onSuccess:()=>invalidate(inv.siteId)})}}><X size={13}/></button></div>)}</div>}</Panel>)}</div>:<Empty title="請求はありません" detail="請求を登録すると、入金予定を一覧で確認できます。" action={<Button onClick={()=>setShow(true)}><Plus size={16}/>請求を登録</Button>}/>}</QueryState>
     {show&&<Modal title={editing?'請求を編集':'請求を登録'} onClose={()=>{setShow(false);setEditing(null)}}><form className="stack-form" onSubmit={save}><div className="form-row"><label>現場<select name="siteId" required defaultValue={editing?.siteId||recent.siteId||''}><option value="" disabled>現場を選択</option>{(sites.data||[]).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>請求先<select name="counterpartyId" required defaultValue={editing?.counterpartyId||recent.counterpartyId||''}><option value="" disabled>取引先を選択</option>{(clients.data||[]).filter(c=>c.isClient).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="form-row"><label>請求日（空欄なら未請求）<input type="date" name="issuedAt" defaultValue={editing?.issuedAt?inputDate(editing.issuedAt):''}/></label><label>入金予定日<input type="date" name="expectedPaymentAt" defaultValue={editing?.expectedPaymentAt?inputDate(editing.expectedPaymentAt):''}/></label></div><LineInputs lines={editing?.lines||[]} lastTaxRate={recent.taxRates?.[0]}/><label>メモ<input name="memo" placeholder="任意" defaultValue={editing?.memo||''}/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>{setShow(false);setEditing(null)}}>キャンセル</Button><Button type="submit" disabled={create.isPending||update.isPending}>{editing?'変更を保存':'請求を登録'}</Button></div></form></Modal>}
    {selected&&selectedQ.data&&<Modal title="入金を記録" onClose={()=>setSelected(null)}><div className="modal-context"><b>{selectedQ.data.counterpartyName}</b><span>{selectedQ.data.siteName}・未入金 {yen(selectedQ.data.outstandingAmount)}</span></div><form className="stack-form" onSubmit={e=>addReceipt(e,selectedQ.data!)}><div className="form-row"><label>入金日<input name="receivedAt" type="date" required defaultValue={today()}/></label><label>入金額<input name="amount" type="number" required min="1" max={selectedQ.data.outstandingAmount||undefined} defaultValue={selectedQ.data.outstandingAmount} inputMode="numeric"/></label></div><label>メモ<input name="memo" placeholder="任意"/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>setSelected(null)}>閉じる</Button><Button type="submit" disabled={receipt.isPending}>{receipt.isPending?'記録中…':'入金を記録'}</Button></div></form></Modal>}
  </>;
}

function PurchasesPage() {
  const q=useGetPurchaseBills();const cps=useGetCounterparties();const sites=useGetSites();const create=useCreatePurchaseBill();const update=useUpdatePurchaseBill();const del=useDeletePurchaseBill();const payment=useCreateSupplierPayment();const delPayment=useDeleteSupplierPayment();const qc=useQueryClient();const [show,setShow]=useState(false);const [editing,setEditing]=useState<PurchaseBill|null>(null);const [selected,setSelected]=useState<PurchaseBill|null>(null);const [filter,setFilter]=useState('all');
  const invalidate=(id?:number)=>{qc.invalidateQueries({queryKey:getGetPurchaseBillsQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});qc.invalidateQueries({queryKey:getGetSiteFinancesQueryKey()});if(id)qc.invalidateQueries({queryKey:getGetSiteQueryKey(id)});};
  const recent=readRecent('recent-purchase');
  const bills=(q.data||[]).filter(b=>filter==='all'||(filter==='unpaid'?b.outstandingAmount>0:true));
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const data:PurchaseBillInput={siteId:Number(f.get('siteId')),counterpartyId:Number(f.get('counterpartyId')),billedAt:String(f.get('billedAt')),dueAt:String(f.get('dueAt')),memo:String(f.get('memo')||'')||null,lines:lineFrom(f)};const done=()=>{saveRecent('recent-purchase',{siteId:data.siteId,counterpartyId:data.counterpartyId,taxRates:data.lines.map(line=>line.taxRate)});invalidate(data.siteId);setShow(false);setEditing(null)};editing?update.mutate({id:editing.id,data},{onSuccess:done}):create.mutate({data},{onSuccess:done});};
  const addPayment=(e:FormEvent<HTMLFormElement>,b:PurchaseBill)=>{e.preventDefault();const f=new FormData(e.currentTarget);payment.mutate({id:b.id,data:{paidAt:String(f.get('paidAt')),amount:Number(f.get('amount')),memo:String(f.get('memo')||'')||null}},{onSuccess:()=>invalidate(b.siteId)});};
  return <><PageHeading eyebrow="PURCHASES / 仕入と支払" title="仕入・支払" subtitle="仕入先への支払いと、支払期日を確認します。" action={<Button onClick={()=>setShow(true)}><Plus size={17}/>仕入を登録</Button>}/><div className="filter-tabs">{[['all','すべて'],['unpaid','未払い']].map(([v,l])=><button key={v} className={filter===v?'selected':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>
    <QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{bills.length?<div className="records-list">{bills.map(b=><Panel className="record-card" key={b.id}><div className="record-main"><div className="record-symbol purchase-symbol"><ArrowUpRight size={18}/></div><div className="record-info"><b>{b.counterpartyName}</b><span>{b.siteName} ・ 請求 {dateLabel(b.billedAt)}</span></div><div className="record-amount"><Money value={b.grossAmount}/><small>{b.outstandingAmount>0?`未払い ${yen(b.outstandingAmount)}`:'支払済み'}</small></div></div><div className="record-bottom"><span className={`status-pill ${b.outstandingAmount>0?'status-open':'status-done'}`}>{b.outstandingAmount>0?'支払待ち':'支払済み'}</span><span className="record-due">支払期日 {dateLabel(b.dueAt)}</span><button className="text-link" onClick={()=>setSelected(b)}>支払いを記録 <ArrowRight size={14}/></button><button className="icon-button" aria-label="仕入を編集" onClick={()=>{setEditing(b);setShow(true)}}><Pencil size={15}/></button><button className="icon-button danger-text" aria-label="仕入を削除" onClick={()=>{if(confirm('この仕入を削除しますか？'))del.mutate({id:b.id},{onSuccess:()=>invalidate(b.siteId)})}}><Trash2 size={15}/></button></div>{b.payments?.length>0&&<div className="receipt-mini-list">{b.payments.map(p=><div key={p.id}><span>{dateLabel(p.paidAt)} 支払い</span><b>{yen(p.amount)}</b><button className="text-action danger-text" aria-label="支払い記録を削除" onClick={()=>{if(confirm('この支払い記録を削除しますか？'))delPayment.mutate({id:p.id},{onSuccess:()=>invalidate(b.siteId)})}}><X size={13}/></button></div>)}</div>}</Panel>)}</div>:<Empty title="仕入はありません" detail="仕入を登録すると、支払予定を管理できます。" action={<Button onClick={()=>setShow(true)}><Plus size={16}/>仕入を登録</Button>}/>}</QueryState>
     {show&&<Modal title={editing?'仕入を編集':'仕入を登録'} onClose={()=>{setShow(false);setEditing(null)}}><form className="stack-form" onSubmit={save}><div className="form-row"><label>現場<select name="siteId" required defaultValue={editing?.siteId||recent.siteId||''}><option value="" disabled>現場を選択</option>{(sites.data||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>仕入先<select name="counterpartyId" required defaultValue={editing?.counterpartyId||recent.counterpartyId||''}><option value="" disabled>取引先を選択</option>{(cps.data||[]).filter(c=>c.isSupplier).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div><div className="form-row"><label>請求日<input name="billedAt" type="date" required defaultValue={inputDate(editing?.billedAt)}/></label><label>支払期日<input name="dueAt" type="date" required defaultValue={inputDate(editing?.dueAt)}/></label></div><LineInputs lines={editing?.lines||[]} lastTaxRate={recent.taxRates?.[0]}/><label>メモ<input name="memo" placeholder="任意" defaultValue={editing?.memo||''}/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>{setShow(false);setEditing(null)}}>キャンセル</Button><Button type="submit" disabled={create.isPending||update.isPending}>{editing?'変更を保存':'仕入を登録'}</Button></div></form></Modal>}
    {selected&&<Modal title="支払いを記録" onClose={()=>setSelected(null)}><div className="modal-context"><b>{selected.counterpartyName}</b><span>{selected.siteName}・未払い {yen(selected.outstandingAmount)}</span></div><form className="stack-form" onSubmit={e=>addPayment(e,selected)}><div className="form-row"><label>支払日<input name="paidAt" type="date" required defaultValue={today()}/></label><label>支払額<input name="amount" type="number" required min="1" defaultValue={selected.outstandingAmount} inputMode="numeric"/></label></div><label>メモ<input name="memo" placeholder="任意"/></label><div className="modal-actions"><Button variant="quiet" onClick={()=>setSelected(null)}>閉じる</Button><Button type="submit">支払いを記録</Button></div></form></Modal>}
  </>;
}

function lineFrom(f:FormData):InvoiceLineInput[] {
  const descriptions=f.getAll('description').map(String);
  const quantities=f.getAll('quantity').map(Number);
  const prices=f.getAll('unitPrice').map(Number);
  const rates=f.getAll('taxRate').map(Number);
  return descriptions.map((description,i)=>({description,quantity:quantities[i]||1,unitPrice:prices[i]||0,taxRate:(rates[i]||10) as 8|10})).filter(line=>line.description.trim().length>0);
}
function LineInputs({lines=[],lastTaxRate=10}:{lines?:InvoiceLineInput[];lastTaxRate?:number}) {
  const [rows,setRows]=useState(()=>lines.length?lines.map(({description,quantity,unitPrice,taxRate})=>({description,quantity,unitPrice,taxRate})): [{description:'工事代金',quantity:1,unitPrice:0,taxRate:(lastTaxRate===8?8:10) as 8|10}]);
  const change=(index:number,field:'description'|'quantity'|'unitPrice'|'taxRate',value:string)=>setRows(current=>current.map((line,i)=>i===index?{...line,[field]:field==='description'?value:Number(value)}:line));
  const net=rows.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);
  const tax=rows.reduce((sum,line)=>sum+Math.round(line.quantity*line.unitPrice*line.taxRate/100),0);
  return <div className="line-inputs"><div className="line-heading"><b>明細</b><span>税率は明細ごとに設定できます</span></div>{rows.map((line,index)=><div className="invoice-line-editor" key={index}><div className="line-row-top"><b>明細 {index+1}</b>{rows.length>1&&<button type="button" className="text-action danger-text" aria-label={`明細${index+1}を削除`} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2 size={14}/>削除</button>}</div><label>内容<input name="description" required value={line.description} onChange={e=>change(index,'description',e.target.value)}/></label><div className="form-row three"><label>数量<input name="quantity" type="number" required min="1" step="1" value={line.quantity} onChange={e=>change(index,'quantity',e.target.value)}/></label><label>単価<input name="unitPrice" type="number" min="0" required inputMode="numeric" placeholder="0" value={line.unitPrice||''} onChange={e=>change(index,'unitPrice',e.target.value)}/></label><label>税率<select name="taxRate" value={line.taxRate} onChange={e=>change(index,'taxRate',e.target.value)}><option value="10">10%</option><option value="8">8%</option></select></label></div></div>)}<button type="button" className="add-line-button" onClick={()=>setRows([...rows,{description:'',quantity:1,unitPrice:0,taxRate:(lastTaxRate===8?8:10) as 8|10}])}><Plus size={15}/>明細を追加</button><div className="amount-preview"><span>税抜 <b>{yen(net)}</b></span><span>消費税 <b>{yen(tax)}</b></span><strong>税込 {yen(net+tax)}</strong></div></div>;
}

function CashflowPage() {
  const [group,setGroup]=useState<'week'|'month'>('week');const [offset,setOffset]=useState(0);
  const range=useMemo(()=>{const start=new Date();start.setHours(0,0,0,0);if(group==='week'){start.setDate(start.getDate()+offset*84);const end=new Date(start);end.setDate(end.getDate()+83);return {from:localIso(start),to:localIso(end)}}start.setDate(1);start.setMonth(start.getMonth()+offset*6);const end=new Date(start.getFullYear(),start.getMonth()+6,0);return {from:localIso(start),to:localIso(end)}},[group,offset]);
  const params={groupBy:group,from:range.from,to:range.to};const q=useGetCashflow(params,{query:{queryKey:getGetCashflowQueryKey(params)}});
  const periods=q.data||[];const events=periods.flatMap(period=>period.events);const incoming=periods.reduce((sum,period)=>sum+period.incoming,0);const outgoing=periods.reduce((sum,period)=>sum+period.outgoing,0);const net=incoming-outgoing;
  const heading=group==='week'?`${dateLabel(range.from)} 〜 ${dateLabel(range.to)}`:`${new Date(`${range.from}T00:00:00`).toLocaleDateString('ja-JP',{year:'numeric',month:'numeric'})} 〜 ${dateLabel(range.to)}`;
  return <><PageHeading eyebrow="CASHFLOW / 資金繰り" title="資金繰り" subtitle="これからの入金・支払いを週ごと、月ごとに並べて確認します。"/>
    <div className="period-controls"><div className="filter-tabs"><button className={group==='week'?'selected':''} onClick={()=>{setGroup('week');setOffset(0)}}>週ごと</button><button className={group==='month'?'selected':''} onClick={()=>{setGroup('month');setOffset(0)}}>月ごと</button></div><div className="period-step"><button className="icon-button" aria-label="前の期間" onClick={()=>setOffset(offset-1)}><ArrowLeft size={16}/></button><b>{heading}</b><button className="icon-button" aria-label="次の期間" onClick={()=>setOffset(offset+1)}><ArrowRight size={16}/></button><button className="today-button" onClick={()=>setOffset(0)}>今日から</button></div></div>
    <QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{q.data&&<><div className="cashflow-overview"><Stat label="入金予定" value={incoming} note="表示期間内の入金予定" tone="stat-sand"/><Stat label="支払予定" value={outgoing} note="表示期間内の支払い" tone="stat-teal"/><Stat label="差引" value={net} note="入金 − 支払い" tone={net>=0?'stat-net-positive':'stat-alert'}/></div><Panel className="cashflow-panel"><div className="panel-top"><div><div className="eyebrow">SCHEDULE</div><h2>期間ごとの予定</h2></div><span className="count-badge">{events.length}件</span></div>{periods.length?periods.map(period=><section className="cashflow-period" key={period.startDate}><div className="cashflow-period-heading"><b>{group==='week'?`${dateLabel(period.startDate)} 〜 ${dateLabel(period.endDate)}`:new Date(`${period.startDate}T00:00:00`).toLocaleDateString('ja-JP',{year:'numeric',month:'long'})}</b><span>入金 <strong>{yen(period.incoming)}</strong></span><span>支払 <strong>{yen(period.outgoing)}</strong></span><span className={period.net<0?'negative-net':''}>差引 <strong>{yen(period.net)}</strong></span></div><EventRows events={period.events}/></section>):<Empty title="予定はありません" detail="請求や仕入の期日が設定されると、ここに表示されます。"/>}</Panel></>}</QueryState>
  </>;
}

function localIso(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}

function ExportPage() {
  const [from,setFrom]=useState('');const [to,setTo]=useState('');const [ready,setReady]=useState(false);const params={...(from?{from}:{}),...(to?{to}:{})};
  const q=useExportCsv(params,{query:{queryKey:getExportCsvQueryKey(params),enabled:ready}});
  const download=()=>{setReady(true);q.refetch().then(r=>{if(r.data){const url=URL.createObjectURL(r.data as Blob);const a=document.createElement('a');a.href=url;a.download=`genba-shushi-${today()}.csv`;a.click();URL.revokeObjectURL(url);setReady(false)}})};
  return <><PageHeading eyebrow="DATA / CSV EXPORT" title="データ出力" subtitle="登録した請求・入金・仕入の記録をCSVで保存します。"/>
    <div className="export-layout"><Panel className="export-card"><div className="export-art"><div className="export-file"><FileText size={30}/><span>CSV</span></div><div className="export-stamp">現場収支<br/>記録データ</div></div><div className="eyebrow">CSV / UTF-8</div><h2>帳簿を手元に保存</h2><p>期間を指定して、現場の収支データをダウンロードできます。期間を空欄にすると全期間が対象です。</p><div className="form-row"><label>開始日<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>終了日<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div><Button onClick={download} disabled={q.isFetching}><Download size={17}/>{q.isFetching?'準備しています…':'CSVをダウンロード'}</Button>{q.isError&&<p className="form-error">出力できませんでした。もう一度お試しください。</p>}</Panel><aside className="export-aside"><div className="eyebrow">NOTE</div><h3>出力について</h3><ul><li>指定期間の記録をCSV形式で保存します。</li><li>出力データはお使いの端末にダウンロードされます。</li><li>帳簿の保管や確認にご利用ください。</li></ul><div className="export-aside-bottom"><ShieldCheck size={17}/>安全に保管してください</div></aside></div>
  </>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" className="modal-card"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20}/></button></div>{children}</section></div>}
function NotFound(){return <div className="state-card"><CircleHelp/><h2>ページが見つかりません</h2><p>指定されたページは存在しないか、移動した可能性があります。</p><Link className="button button-primary" href="/">ホームに戻る</Link></div>}

function Root() {return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><App/></WouterRouter></QueryClientProvider>}
export default Root;
