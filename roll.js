// 課堂頁面的「點名」分頁。和 index.html 的主程式共用同一組全域（api、S、main、sheet…），
// 後端在 src/rollcall.js。學生：在老師開放的時間內點自己的座位，可以改。
// 老師：開始／結束點名、看誰坐哪裡、幫學生改位置、隨機抽籤、編輯配置圖庫。
// 配置圖每一格是：1 座位、0 走道、P 講台、T 老師、L 文字（labels 存文字）。
// 講台可以放在任何地方；座位的「第幾排第幾個」從講台那一側算起，面向講台由左往右數。
// 沒有 P 格的舊配置圖，講台畫在最上方。

const R={state:null,timer:null,poll:null,flip:false,edit:null,tool:'1',spinning:false};
function rollLeave(){clearInterval(R.timer);clearInterval(R.poll);R.timer=R.poll=null;}
const TEACHER_SVG='<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3a5.5 5.5 0 0 1 5.5 5.5V21"/><path d="M12 14v3"/></svg>';
// Seat 'r-c' as people say it: rows counted from the podium side, seats from the left as you face it.
function seatName(seat,layout){
  layout=layout||(R.state&&R.state.layout);const [r,c]=seat.split('-').map(Number);
  if(!layout)return `第 ${r} 排第 ${c} 個`;
  const rows=layout.rows,seatRows=rows.map((row,i)=>row.includes('1')?i+1:0).filter(Boolean);
  const pods=[];rows.forEach((row,i)=>[...row].forEach(ch=>{if(ch==='P')pods.push(i+1);}));
  const mid=seatRows.reduce((a,b)=>a+b,0)/Math.max(1,seatRows.length);
  const below=pods.length&&pods.reduce((a,b)=>a+b,0)/pods.length>mid;
  const order=below?seatRows.slice().reverse():seatRows;
  const inRow=[...rows[r-1]].map((ch,i)=>ch==='1'?i+1:0).filter(Boolean);
  const along=below?inRow.slice().reverse():inRow;
  return `第 ${order.indexOf(r)+1} 排第 ${along.indexOf(c)+1} 個`;
}
const mmss=sec=>Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
const shortName=who=>[...who].slice(0,2).join('');

// `seatCell(seat)` draws a seat; podium, teacher and text cells are drawn here. `flip` turns the
// room half a circle. Layouts without a P cell get the podium above row 1, as before.
const LABEL_DEFAULT={P:'講台',T:'老師'};
function fixedCell(kind,text){
  if(kind==='P')return `<span class="seat podcell" role="img" aria-label="${esc(text||'講台')}">${esc(text||'')}</span>`;
  if(kind==='T')return `<span class="seat teach" role="img" aria-label="${esc(text||'老師')}">${TEACHER_SVG}${text&&text!=='老師'?`<small>${esc(text)}</small>`:''}</span>`;
  if(kind==='L')return `<span class="seat label">${esc(text||'')}</span>`;
  return '<span class="seat none" aria-hidden="true"></span>';
}
// The podium text goes on one P cell of each run, so a wide podium reads once.
function podiumText(layout,r,c){
  const row=layout.rows[r-1],label=(layout.labels||{})[r+'-'+c];
  if(label)return label;
  let start=c;while(start>1&&row[start-2]==='P')start--;let end=c;while(end<row.length&&row[end]==='P')end++;
  return c===Math.floor((start+end)/2)&&!Object.keys(layout.labels||{}).some(k=>{const [kr,kc]=k.split('-').map(Number);return kr===r&&kc>=start&&kc<=end&&row[kc-1]==='P';})?'講台':'';
}
function seatGrid(layout,seatCell,flip,bare){
  const rows=layout.rows,labels=layout.labels||{};
  let cells=rows.map((row,r)=>[...row].map((kind,c)=>({seat:(r+1)+'-'+(c+1),kind,r:r+1,c:c+1})));
  if(flip)cells=cells.slice().reverse().map(row=>row.slice().reverse());
  const body=`<div class="seats" style="grid-template-columns:repeat(${rows[0].length},minmax(0,1fr))">`+
    cells.map(row=>row.map(x=>x.kind==='1'?seatCell(x.seat)
      :fixedCell(x.kind,x.kind==='P'?podiumText(layout,x.r,x.c):labels[x.seat]||LABEL_DEFAULT[x.kind])).join('')).join('')+'</div>';
  if(bare||rows.join('').includes('P'))return body;
  return flip?body+'<div class="podium" style="margin:12px auto 0">講台</div>':'<div class="podium">講台</div>'+body;
}

// ---------- load and keep fresh ----------
VIEW.roll=async function(){
  const mine=++seq;skeleton(main,[72,300]);
  try{
    R.state=await api('rollcall');if(mine!==seq||S.tab!=='roll')return;
    main.removeAttribute('aria-busy');rollPaint();rollWatch();
  }catch(error){if(mine!==seq)return;main.removeAttribute('aria-busy');main.innerHTML=problem(error,'view');}
};
function rollWatch(){
  rollLeave();
  if(!R.state||!R.state.open)return;
  R.timer=setInterval(()=>{
    R.state.endsIn=Math.max(0,R.state.endsIn-1);
    const el=$('rollLeft');if(el)el.textContent=mmss(R.state.endsIn);
    if(R.state.endsIn===0)rollRefresh();
  },1000);
  // Many phones at once: students ask rarely, the teacher's screen is the live one.
  R.poll=setInterval(rollRefresh,asTeacher()?5000:15000);
}
async function rollRefresh(){
  if(S.tab!=='roll'||R.spinning)return;
  try{
    const next=await api('rollcall');
    if(S.tab!=='roll'||R.spinning)return;
    const wasOpen=R.state&&R.state.open;R.state=next;
    if(!R.edit&&!document.querySelector('.scrim'))rollPaint();
    if(wasOpen!==next.open)rollWatch();
  }catch(error){/* the next tick tries again */}
}
function rollTake(state){R.state=state;rollPaint();rollWatch();}
function rollPaint(){
  const keep=window.scrollY;
  main.innerHTML=asTeacher()?(R.edit?editorHtml():teacherHtml(R.state)):studentHtml(R.state);
  window.scrollTo(0,keep);
}

// ---------- student ----------
function studentHtml(st){
  if(!st.layout)return empty('老師還沒有開始點名。<br>開始之後，這裡會出現座位圖。','<button type="button" class="btn" data-rollrefresh>重新整理</button>');
  const head=st.open
    ?`<div class="card"><div class="rowline"><span class="tag ok">${ic('ok')}點名中</span><span>剩 <b class="num" id="rollLeft">${mmss(st.endsIn)}</b></span></div>
        <p class="big" style="margin:8px 0 0">${st.mine?'你的位置：'+seatName(st.mine):'點一下你坐的位置'}</p>
        <p class="hint">照教室的位置點，講台和老師畫在圖上。時間內可以改：直接點另一個空位。</p></div>`
    :`<div class="card"><div class="rowline"><span class="tag no">已結束</span><span>${dayWeek(st.day)} ${esc(st.key)}</span></div>
        <p class="big" style="margin:8px 0 0">${st.mine?'你的位置：'+seatName(st.mine):'這次沒有點到位置'}</p>
        ${st.mine?'':'<p class="hint">如果你有來上課，請直接告訴老師，老師可以幫你補上。</p>'}</div>`;
  const taken=new Set(st.taken);
  return head+`<div class="card" style="margin-top:12px">${seatGrid(st.layout,seat=>
      seat===st.mine?`<button type="button" class="seat mine" disabled aria-label="你的位置，${seatName(seat)}">我</button>`
      :taken.has(seat)?`<button type="button" class="seat taken" disabled aria-label="${seatName(seat)}，已經有人"></button>`
      :`<button type="button" class="seat" data-seat="${seat}" ${st.open?'':'disabled'} aria-label="${seatName(seat)}，空位"></button>`)}
    <div class="legend"><span><i style="background:var(--brand);border-color:var(--brand)"></i>你</span><span><i style="background:var(--surface-2)"></i>已經有人</span><span><i></i>空位</span></div></div>`;
}

// ---------- teacher ----------
function teacherHtml(st){
  let html='';
  if(st.layout){
    const pin=new Map(st.pins.map(p=>[p.seat,p])),drawn=new Set(st.drawn),last=st.last&&st.last.seat;
    html+=`<div class="card"><div class="rowline">${st.open
        ?`<span class="tag ok">${ic('ok')}點名中</span><span>剩 <b class="num" id="rollLeft">${mmss(st.endsIn)}</b></span><span class="grow"></span><button type="button" class="btn" data-rollstop>結束點名</button>`
        :`<span class="tag no">已結束</span><span>${dayWeek(st.day)} ${esc(st.key)}</span>`}</div>
      <div class="tiles" style="margin-top:12px"><div class="tile"><div class="k">已點位置</div><div class="v">${st.pins.length} <small>人</small></div></div>
        <div class="tile"><div class="k">還沒點</div><div class="v">${st.absent.length} <small>人</small></div></div></div></div>
      <div class="card" aria-live="polite"><div class="hint" style="margin:0">抽籤</div>
        <div class="big" id="drawWho">${st.last?esc(st.last.who):'還沒抽'}</div>
        <div class="hint" id="drawSeat">${st.last?seatName(st.last.seat):'只會抽到這次有點位置的人，抽過的不會再抽到。'}</div>
        <div class="rowline" style="margin-top:12px"><button type="button" class="btn primary" data-rolldraw ${st.pins.length?'':'disabled'}>${ic('dice')}抽一位</button>
          ${st.drawn.length?`<button type="button" class="btn" data-rollreset>重新開始（已抽 ${st.drawn.length}）</button>`:''}</div></div>
      <div class="card"><div class="chips" style="margin-top:0">${`<button type="button" class="chip" data-flip aria-pressed="${R.flip}">轉 180°</button>`}</div>
        ${seatGrid(st.layout,seat=>{
          const p=pin.get(seat);
          return p?`<button type="button" class="seat taken${drawn.has(seat)?' drawn':''}${seat===last?' hit':''}" data-tseat="${seat}" aria-label="${seatName(seat)}，${esc(p.who)}${seat===last?'，剛抽中':''}">${esc(shortName(p.who))}</button>`
            :`<button type="button" class="seat" data-tseat="${seat}" aria-label="${seatName(seat)}，空位"></button>`;
        },R.flip)}
        <div class="legend"><span><i style="background:var(--surface-2)"></i>已點</span><span><i style="background:var(--ok-soft);border-color:var(--ok)"></i>抽過</span><span><i style="background:var(--warn);border-color:var(--warn)"></i>剛抽中</span></div>
        <p class="hint">點任何一格可以幫學生補位置、換位置或取消。</p></div>
      ${st.absent.length?`<h2>還沒點位置（${st.absent.length}）</h2><ul class="list">${st.absent.map(p=>`<li><div class="grow"><b>${esc(p.who)}</b></div></li>`).join('')}</ul>
        <p class="hint">只列出這學期在群組發言過的人。</p>`:''}`;
  }
  if(!st.open){
    html+=`<h2>${st.layout?'開始新的點名':'開始點名'}</h2>`+(st.layouts.length
      ?`<form class="card" id="rollStart" novalidate>
          <label class="f" for="rollLayout" style="margin-top:0">配置圖</label>
          <select class="t" id="rollLayout">${st.layouts.map(l=>`<option value="${l.id}" ${l.id===st.defaultLayout?'selected':''}>${esc(l.name)}</option>`).join('')}</select>
          <label class="f" for="rollMinutes">開放多久</label>
          <select class="t" id="rollMinutes">${[3,5,10,15,20,30].map(m=>`<option value="${m}" ${m===10?'selected':''}>${m} 分鐘</option>`).join('')}</select>
          <p class="hint">時間到會自動結束。之後學生不能再改，你還是可以幫他們改。</p>
          <button class="btn primary block" style="margin-top:12px" type="submit">${ic('pin')}開始點名</button></form>`
      :'<p class="hint">還沒有配置圖。先在下面新增一張教室的座位圖。</p>');
  }
  html+=`<h2>配置圖</h2>${st.layouts.length?`<ul class="list">${st.layouts.map(l=>`<li><div class="grow"><b>${esc(l.name)}</b>
      <div class="meta"><span class="num">${l.rows.length} × ${l.rows[0].length} 格</span><span class="num">${l.rows.join('').split('1').length-1} 個座位</span></div></div>
      <button type="button" class="btn" data-layoutedit="${l.id}">${ic('edit')}編輯</button></li>`).join('')}</ul>`:''}
    <button type="button" class="btn block" style="margin-top:12px" data-layoutedit="">${ic('plus')}新增配置圖</button>
    <h2>點名紀錄</h2><div id="rollHist"><button type="button" class="btn block" data-rollhist>看每次點名與出席次數</button></div>`;
  return html;
}

// ---------- layout editor ----------
// Cells are characters (1 0 P T L) and labels hold the text of P, T and L cells. A tool is chosen
// first, then cells are tapped: the same tap places, moves (the teacher) or erases (tap again).
const TOOLS=[['1','座位'],['0','走道'],['P','講台'],['T','老師'],['L','文字']];
function editStart(id){
  const from=R.state.layouts.find(l=>l.id===id);
  R.edit=from?{id,name:from.name,cells:from.rows.map(r=>[...r]),labels:{...(from.labels||{})}}
    :{id:'',name:'',labels:{},cells:[[...'0PPP00T'],...Array.from({length:4},()=>[...'1110111'])]};
  R.tool='1';rollLeave();rollPaint();window.scrollTo(0,0);
}
function editResize(rows,cols){
  const old=R.edit.cells;rows=Math.min(15,Math.max(1,rows));cols=Math.min(15,Math.max(1,cols));
  R.edit.cells=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>old[r]&&old[r][c]!==undefined?old[r][c]:'1'));
  Object.keys(R.edit.labels).forEach(k=>{const [r,c]=k.split('-').map(Number);if(r>rows||c>cols)delete R.edit.labels[k];});
}
function editPaint(seat,text){
  const e=R.edit,[r,c]=seat.split('-').map(Number),now=e.cells[r-1][c-1],tool=R.tool;
  if(tool==='T')e.cells.forEach((row,ri)=>row.forEach((ch,ci)=>{if(ch==='T'){row[ci]='0';delete e.labels[(ri+1)+'-'+(ci+1)];}}));
  const next=now===tool&&tool!=='L'&&tool!=='T'&&tool!=='1'?'0':tool;
  e.cells[r-1][c-1]=next;
  if(next==='L')e.labels[seat]=text;else if(next!=='P'&&next!=='T')delete e.labels[seat];
}
function editorHtml(){
  const e=R.edit,rows=e.cells.length,cols=e.cells[0].length,flat=e.cells.flat(),seats=flat.filter(x=>x==='1').length;
  const step=(what,n)=>`<div class="stepper"><button type="button" class="btn" data-size="${what}:-1" aria-label="${what==='rows'?'少一列':'少一行'}">−</button>
    <output aria-live="polite">${n}</output><button type="button" class="btn" data-size="${what}:1" aria-label="${what==='rows'?'多一列':'多一行'}">＋</button></div>`;
  const layout={rows:e.cells.map(r=>r.join('')),labels:e.labels};
  const grid=seatGrid({rows:layout.rows.map(()=> '1'.repeat(cols)),labels:{}},seat=>{
    const [r,c]=seat.split('-').map(Number),kind=e.cells[r-1][c-1];
    const inner=kind==='1'?'':kind==='0'?'×':kind==='P'?esc(podiumText(layout,r,c)):kind==='T'?TEACHER_SVG:esc(e.labels[seat]||'');
    const cls={1:'taken',0:'off',P:'podcell',T:'teach',L:'label'}[kind];
    return `<button type="button" class="seat ${cls}" data-cell="${seat}" aria-label="第 ${r} 列第 ${c} 格：${({1:'座位',0:'走道',P:'講台',T:'老師',L:'文字 '+(e.labels[seat]||'')})[kind]}">${inner}</button>`;
  },false,true);
  return `<h2>${e.id?'編輯配置圖':'新增配置圖'}</h2>
    <form class="card" id="layoutForm" novalidate>
      <label class="f" for="layoutName" style="margin-top:0">名稱</label>
      <input class="t" id="layoutName" value="${esc(e.name)}" maxlength="20" placeholder="台達館 105" aria-describedby="layoutErr">
      <p class="err" id="layoutErr" role="alert" hidden></p>
      <div class="rowline" style="margin-top:12px;gap:24px"><div><div class="f" style="margin-top:0">列數（前後）</div>${step('rows',rows)}</div>
        <div><div class="f" style="margin-top:0">每列幾格（左右）</div>${step('cols',cols)}</div></div>
      <div class="f">先選要放什麼，再點格子</div>
      <div class="chips" role="radiogroup" aria-label="要放什麼" style="margin-top:4px">${TOOLS.map(([k,l])=>`<button type="button" class="chip" role="radio" data-tool="${k}" aria-checked="${R.tool===k}" aria-pressed="${R.tool===k}">${l}</button>`).join('')}</div>
      <p class="hint">${({1:'點格子變成座位。',0:'點格子變成走道或沒有桌子。',P:'點格子放講台，可以連成一長條。點已經是講台的格子，可以改字或拿掉。',T:'點一格放老師，會從原本的位置移過來。再點老師格可以改字。',L:'點格子輸入文字，例如門口、窗戶、投影幕。'})[R.tool]}
       目前 ${seats} 個座位。</p>
      <div style="margin-top:8px">${grid}</div>
      <button class="btn primary block" style="margin-top:16px" type="submit">儲存配置圖</button>
      <div class="rowline" style="margin-top:8px"><button type="button" class="btn grow" data-editcancel>取消</button>
        ${e.id?'<button type="button" class="btn" data-layoutdelete style="color:var(--danger)">刪除這張</button>':''}</div>
    </form>`;
}
// Text for a cell: a label cell asks first; a podium or teacher cell is renamed when tapped again.
function textDialog(title,value,done){
  const close=sheet(`<h3 id="sheetTitle">${esc(title)}</h3>
    <label class="f" for="cellText">文字（最多 6 個字）</label><input class="t" id="cellText" maxlength="6" value="${esc(value||'')}">
    <p class="err" id="cellErr" role="alert" hidden></p>
    <div class="row"><button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="cellOk">確定</button></div>`);
  const ok=()=>{const v=$('cellText').value.trim();if(!v&&title.startsWith('文字')){const el=$('cellErr');el.textContent='請輸入文字，不要的話改選「走道」。';el.hidden=false;return;}close();done(v);};
  $('cellOk').addEventListener('click',ok);
  $('cellText').addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();ok();}});
}

// ---------- teacher: one seat ----------
function seatDialog(seat){
  const st=R.state,p=st.pins.find(x=>x.seat===seat);
  if(p){
    const close=sheet(`<h3 id="sheetTitle">${esc(p.who)}</h3><p class="hint">${seatName(seat)}・${esc(p.time)} 點的</p>
      <p class="err" id="seatErr" role="alert" hidden></p>
      <div class="row">${p.person?'<button type="button" class="btn" id="seatClear" style="color:var(--danger)">取消他的位置</button>':''}<button type="button" class="btn" data-close>關閉</button></div>
      ${p.person?'<p class="hint">要換位置：先關閉，再點他要去的空位，從名單選他。</p>':'<p class="hint">這是你自己在預覽學生畫面時點的。</p>'}`);
    if(p.person)$('seatClear').addEventListener('click',e=>busy(e.currentTarget,async()=>{
      try{const next=await api('rollAssign',{person:p.person,seat:''});close();rollTake(next);toast('已取消 '+p.who+' 的位置');}
      catch(error){const el=$('seatErr');el.textContent=error.message;el.hidden=false;}}));
    return;
  }
  const movable=st.pins.filter(x=>x.person),people=[...st.absent.map(a=>({...a,note:''})),...movable.map(m=>({person:m.person,who:m.who,note:'（從'+seatName(m.seat)+'移過來）'}))];
  const close=sheet(`<h3 id="sheetTitle">${seatName(seat)}</h3>${people.length
    ?`<label class="f" for="seatWho">誰坐這裡</label><select class="t" id="seatWho">${people.map(x=>`<option value="${x.person}">${esc(x.who+x.note)}</option>`).join('')}</select>
      <p class="err" id="seatErr" role="alert" hidden></p>
      <div class="row"><button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="seatSet">確定</button></div>`
    :'<p class="hint">名單上沒有可以指定的學生。只有這學期在群組發言過的人會出現在名單上。</p><div class="row"><button type="button" class="btn" data-close>關閉</button></div>'}`);
  if(people.length)$('seatSet').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const who=people.find(x=>String(x.person)===$('seatWho').value);
    try{const next=await api('rollAssign',{person:who.person,seat});close();rollTake(next);toast(who.who+' → '+seatName(seat));}
    catch(error){const el=$('seatErr');el.textContent=error.message;el.hidden=false;}}));
}

// ---------- draw ----------
async function drawOne(btn){
  const before=R.state,pool=before.pins.map(p=>p.seat).filter(s=>!before.drawn.includes(s));
  R.spinning=true;btn.disabled=true;
  try{
    const result=await api('rollDraw');
    const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!still&&pool.length>1){
      // The pick is already made on the server; this only lets the room watch it land.
      $('drawWho').textContent='…';$('drawSeat').textContent='抽籤中';
      for(let i=0;i<14;i++){
        document.querySelectorAll('.seat.spin').forEach(el=>el.classList.remove('spin'));
        const at=document.querySelector(`[data-tseat="${pool[Math.floor(Math.random()*pool.length)]}"]`);if(at)at.classList.add('spin');
        await new Promise(r=>setTimeout(r,70+i*14));
      }
    }
    R.spinning=false;rollTake(result.state);
    const hit=document.querySelector('.seat.hit');if(hit)hit.scrollIntoView({block:'nearest'});
  }catch(error){R.spinning=false;btn.disabled=false;toast(error.message,'alert');}
}

// ---------- events ----------
main.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t||S.tab!=='roll')return;const d=t.dataset;
  if('seat' in d){
    t.disabled=true;t.textContent='…';
    try{rollTake(await api('pin',{seat:d.seat}));toast('已記下你的位置：'+seatName(d.seat));}
    catch(error){toast(error.message,'alert');rollRefresh();}
  }
  else if('rollrefresh' in d){VIEW.roll();}
  else if('tseat' in d){seatDialog(d.tseat);}
  else if('flip' in d){R.flip=!R.flip;rollPaint();}
  else if('rolldraw' in d){drawOne(t);}
  else if('rollreset' in d){busy(t,async()=>{try{rollTake(await api('rollReset'));toast('可以重新抽一輪了');}catch(error){toast(error.message,'alert');}});}
  else if('rollstop' in d){busy(t,async()=>{try{rollTake(await api('rollStop'));toast('點名已結束');}catch(error){toast(error.message,'alert');}});}
  else if('rollhist' in d){
    const box=$('rollHist');skeleton(box,[56,56]);
    try{const h=await api('rollHistory');if(!$('rollHist'))return;box.removeAttribute('aria-busy');
      box.innerHTML=h.total?`<ul class="list">${h.sessions.map(s=>`<li><div class="grow"><b>${dayWeek(s.day)}</b> <span class="num">${esc(s.key)}</span><div class="meta"><span>${esc(s.layout)}</span></div></div><span class="num">${s.count} 人</span></li>`).join('')}</ul>
        <h2>出席次數（共 ${h.total} 次點名）</h2><ul class="list">${h.people.map(p=>`<li><div class="grow"><b>${esc(p.who)}</b></div><span class="num">${p.count} / ${h.total}</span></li>`).join('')}</ul>
        <p class="hint">由少到多排列；只列出這學期在群組發言過的人。</p>`:empty('還沒有點名紀錄。');
    }catch(error){box.removeAttribute('aria-busy');box.innerHTML=problem(error,'view');}
  }
  else if('layoutedit' in d){editStart(d.layoutedit);}
  else if('editcancel' in d){R.edit=null;rollPaint();rollWatch();}
  else if('tool' in d){R.edit.name=$('layoutName').value;R.tool=d.tool;rollPaint();}
  else if('cell' in d){
    const e2=R.edit,seat=d.cell,[r,c]=seat.split('-').map(Number),kind=e2.cells[r-1][c-1];e2.name=$('layoutName').value;
    const again=()=>{rollPaint();const el=document.querySelector(`[data-cell="${seat}"]`);if(el)el.focus({preventScroll:true});};
    // Tapping a podium or teacher cell with its own tool renames it instead of erasing it.
    if((kind==='P'&&R.tool==='P')||(kind==='T'&&R.tool==='T')){
      textDialog(kind==='P'?'講台上的字':'老師格的字',e2.labels[seat]||LABEL_DEFAULT[kind],v=>{if(v&&v!==LABEL_DEFAULT[kind])e2.labels[seat]=v;else delete e2.labels[seat];again();});
      if(kind==='P'){const sh=document.querySelector('.sheet .row');sh.insertAdjacentHTML('afterbegin','<button type="button" class="btn" id="podRemove" style="color:var(--danger)">拿掉這格</button>');
        $('podRemove').addEventListener('click',()=>{e2.cells[r-1][c-1]='0';delete e2.labels[seat];$('overlay').innerHTML='';again();});}
    }
    else if(R.tool==='L')textDialog('文字',kind==='L'?e2.labels[seat]:'',v=>{editPaint(seat,v);again();});
    else{editPaint(seat);again();}
  }
  else if('size' in d){
    R.edit.name=$('layoutName').value;const [what,by]=d.size.split(':');
    editResize(R.edit.cells.length+(what==='rows'?+by:0),R.edit.cells[0].length+(what==='cols'?+by:0));rollPaint();
  }
  else if('layoutdelete' in d){
    const name=R.edit.name,id=R.edit.id;
    const close=sheet(`<h3 id="sheetTitle">刪除「${esc(name)}」？</h3><p class="hint">已經存下的點名紀錄不受影響，只是之後不能再選這張配置圖。</p>
      <div class="row"><button type="button" class="btn" data-close>不要刪</button><button type="button" class="btn" id="layoutKill" style="color:var(--danger)">刪除</button></div>`);
    $('layoutKill').addEventListener('click',ev=>busy(ev.currentTarget,async()=>{
      try{const next=await api('layoutDelete',{id});close();R.edit=null;rollTake(next);toast('已刪除「'+name+'」');}catch(error){close();toast(error.message,'alert');}}));
  }
});
main.addEventListener('submit',e=>{
  const form=e.target,btn=form.querySelector('[type=submit]');
  if(form.id==='rollStart'){
    e.preventDefault();
    busy(btn,async()=>{try{rollTake(await api('rollStart',{layout:$('rollLayout').value,minutes:+$('rollMinutes').value}));toast('開始點名，請學生打開課堂頁面的「點名」');window.scrollTo(0,0);}
      catch(error){toast(error.message,'alert');}});
  }else if(form.id==='layoutForm'){
    e.preventDefault();
    const name=$('layoutName').value.trim(),err=$('layoutErr');R.edit.name=name;
    const fail=text=>{err.textContent=text;err.hidden=false;$('layoutName').setAttribute('aria-invalid','true');$('layoutName').focus();};
    if(!name)return fail('請幫這張配置圖取一個名字，例如教室名稱。');
    if(!R.edit.cells.flat().includes('1'))return fail('至少要留一個座位。');
    busy(btn,async()=>{try{const saved=await api('layoutSave',{id:R.edit.id,name,rows:R.edit.cells.map(r=>r.join('')),labels:R.edit.labels});
        R.edit=null;rollTake(saved.state);toast('已儲存「'+name+'」');}
      catch(error){fail(error.message);}});
  }
});

// ---------- demo data (示範模式) ----------
const DR={layouts:{a:{name:'台達館 105',rows:['L0PPP0T','1110111','1110111','1110111','0110110'],labels:{'1-1':'投影幕'}},
  b:{name:'人社院 C310',rows:['11111','11111','11111']}},def:'a',session:null,pins:[],n:0};
(function(){
  DR.session={day:today,key:'10:00',end:Date.now()+8*60e3,closed:false,layout:DR.layouts.a,drawn:[],last:null};
  DR.pins=[['林柏宇','2-1'],['王子晴','2-5'],['張家豪','3-2'],['李宜蓁','4-6']].map(([who,seat])=>({who,seat,time:'10:0'+(DR.n++)}));
})();
function demoRoll(action,b){
  const teacher=demo.teacher&&!b.asStudent,me=demo.nick,s=DR.session,open=!!s&&!s.closed&&Date.now()<s.end;
  const person=who=>{const i=DEMO_PEOPLE.indexOf(who);return i<0?null:i+3;};
  const fail=(code,text)=>{throw Object.assign(new Error(text),{code});};
  const state=()=>{
    const cur=DR.session,st={open:!!cur&&!cur.closed&&Date.now()<cur.end,mine:(DR.pins.find(p=>p.who===me)||{}).seat||''};
    if(cur)Object.assign(st,{day:cur.day,key:cur.key,endsIn:Math.max(0,Math.round((cur.end-Date.now())/1000)),layout:cur.layout,taken:DR.pins.map(p=>p.seat)});
    if(!teacher)return st;
    return Object.assign(st,{pins:DR.pins.map(p=>({seat:p.seat,who:p.who,person:person(p.who),time:p.time})),
      absent:DEMO_PEOPLE.filter(w=>!DR.pins.some(p=>p.who===w)).map(w=>({person:person(w),who:w})),
      drawn:cur?DR.pins.filter(p=>cur.drawn.includes(p.who)).map(p=>p.seat):[],
      last:cur&&cur.last&&DR.pins.find(p=>p.who===cur.last)?{seat:DR.pins.find(p=>p.who===cur.last).seat,who:cur.last}:null,
      layouts:Object.entries(DR.layouts).map(([id,l])=>({id,name:l.name,rows:l.rows,labels:l.labels||{}})),defaultLayout:DR.def});
  };
  const put=(who,seat,time)=>{if(DR.pins.some(p=>p.seat===seat&&p.who!==who))fail('taken','這個位置剛剛被別人點走了，請選另一個。');
    const mine=DR.pins.find(p=>p.who===who);if(mine)Object.assign(mine,{seat,time});else DR.pins.push({who,seat,time});};
  if(['rollStart','rollStop','rollDraw','rollReset','rollAssign','rollHistory','layoutSave','layoutDelete'].includes(action)&&!teacher)fail('teacher_only','這個功能只有老師能用。');
  switch(action){
    case 'rollcall':return state();
    case 'pin':if(!open)fail('closed','現在不是點名時間。');put(me,b.seat,'10:05');return state();
    case 'rollStart':DR.def=b.layout;DR.pins=[];DR.session={day:today,key:'10:'+(20+DR.n++),end:Date.now()+b.minutes*60e3,closed:false,layout:DR.layouts[b.layout],drawn:[],last:null};return state();
    case 'rollStop':s.closed=true;return state();
    case 'rollDraw':{const left=DR.pins.filter(p=>!s.drawn.includes(p.who));if(!left.length)fail('all_drawn','每個人都抽過了。按「重新開始」可以再抽一輪。');
      const pick=left[Math.floor(Math.random()*left.length)];s.drawn.push(pick.who);s.last=pick.who;return {seat:pick.seat,who:pick.who,left:left.length-1,state:state()};}
    case 'rollReset':s.drawn=[];s.last=null;return state();
    case 'rollAssign':{const who=DEMO_PEOPLE[b.person-3];if(b.seat==='')DR.pins=DR.pins.filter(p=>p.who!==who);else put(who,b.seat,'10:09 老師');return state();}
    case 'rollHistory':return {total:3,sessions:[{day:today,key:'10:00',week:week(today),layout:'台達館 105',count:DR.pins.length},{day:taipei(-7),key:'10:02',week:week(taipei(-7)),layout:'台達館 105',count:5},{day:taipei(-14),key:'10:01',week:week(taipei(-14)),layout:'台達館 105',count:6}],
      people:DEMO_PEOPLE.map((who,i)=>({person:i+3,who,count:[3,3,2,3,1,2][i]})).sort((x,y)=>x.count-y.count)};
    case 'layoutSave':{const id=b.id&&DR.layouts[b.id]?b.id:'n'+(DR.n++);DR.layouts[id]={name:b.name,rows:b.rows,labels:b.labels||{}};return {id,state:state()};}
    case 'layoutDelete':delete DR.layouts[b.id];return state();
  }
}
