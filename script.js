const connect_btn = document.getElementById('connectbtn');
const reset_btn   = document.getElementById('resetbtn');
const open_settings_btn  = document.getElementById('opensettings');
const close_settings_btn = document.getElementById('closesettings');
const side_bar   = document.getElementById('sidebar');
const over_lay   = document.getElementById('overlay');
const save_tasks_btn = document.getElementById('savetasksbtn');
const task_inputs    = document.querySelectorAll('.taskinput');
const limit_inputs   = document.querySelectorAll('.limitinput');
const limit_warning  = document.getElementById('limitwarning');
const active_task_display = document.getElementById('activetaskdisplay');
const face_selector  = document.getElementById('faceselector');
const cube_side      = document.getElementById('cubeside');
const status_dot     = document.getElementById('statusdot');
const status_text    = document.getElementById('statustext');
const timer_display  = document.querySelector('.timerdisplay');
const dark_toggle_btn = document.getElementById('darktogglebtn');

const view_stats_btn     = document.getElementById('viewstatsbtn');
const back_btn           = document.getElementById('backbtn');
const main_view          = document.getElementById('mainview');
const stats_view         = document.getElementById('statsview');
const donut_chart        = document.getElementById('donutchart');
const total_time_display = document.getElementById('total-time-display');
const legend_container   = document.getElementById('legend-container');

const weekly_view          = document.getElementById('weeklyview');
const view_detailed_btn    = document.getElementById('viewdetailedbtn');
const back_from_weekly_btn = document.getElementById('backfromweeklybtn');
const ai_summary_box  = document.getElementById('aisummarybox');
const ai_summary_text = document.getElementById('aisummarytext');

const face_themes = [
    { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7', dot: '#81c784', hover: '#1b5e20', disabled: '#c8e6c9' },
    { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9', dot: '#64b5f6', hover: '#0d47a1', disabled: '#bbdefb' },
    { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8', dot: '#ba68c8', hover: '#4a148c', disabled: '#e1bee7' },
    { bg: '#fff3e0', text: '#e65100', border: '#ffcc80', dot: '#ffb74d', hover: '#bf360c', disabled: '#ffe0b2' },
    { bg: '#ffebee', text: '#c62828', border: '#ef9a9a', dot: '#e57373', hover: '#b71c1c', disabled: '#ffcdd2' },
    { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', dot: '#4db6ac', hover: '#004d40', disabled: '#b2dfdb' },
];

let serial_port   = null;
let serial_reader = null;
let serial_writer = null;
let receive_buffer = '';
let active_face   = 1;
let last_face     = -1;
let face_seconds  = [0, 0, 0, 0, 0, 0];
let live_interval = null;
let live_seconds  = 0;
let is_dark       = false;

const TODAY_KEY  = new Date().toISOString().slice(0, 10);
const LS_WEEKLY  = 'pc_weekly';
const LS_TASKS   = 'pc_tasks';
const LS_LIMITS  = 'pc_limits';
const LS_DARK    = 'pc_dark';

function save_today() {
    try {
        const weekly = JSON.parse(localStorage.getItem(LS_WEEKLY) || '{}');
        weekly[TODAY_KEY] = {
            face_seconds: [...face_seconds],
            tasks: Array.from(task_inputs).map(i => i.value)
        };
        localStorage.setItem(LS_WEEKLY, JSON.stringify(weekly));
    } catch(e) {}
}

function load_weekly() {
    try {
        return JSON.parse(localStorage.getItem(LS_WEEKLY) || '{}');
    } catch(e) { return {}; }
}

function save_tasks_and_limits() {
    const tasks  = Array.from(task_inputs).map(i => i.value);
    const limits = Array.from(limit_inputs).map(i => i.value);
    localStorage.setItem(LS_TASKS,  JSON.stringify(tasks));
    localStorage.setItem(LS_LIMITS, JSON.stringify(limits));
}

function load_tasks_and_limits() {
    try {
        const tasks  = JSON.parse(localStorage.getItem(LS_TASKS)  || '[]');
        const limits = JSON.parse(localStorage.getItem(LS_LIMITS) || '[]');
        task_inputs.forEach((inp, i)  => { if (tasks[i]  !== undefined && tasks[i]  !== '') inp.value = tasks[i]; });
        limit_inputs.forEach((inp, i) => { if (limits[i] !== undefined) inp.value = limits[i]; });
    } catch(e) {}
}

function load_today_from_storage() {
    try {
        const weekly = load_weekly();
        const entry  = weekly[TODAY_KEY];
        if (entry && Array.isArray(entry.face_seconds)) {
            face_seconds = entry.face_seconds.map(s => Number(s) || 0);
        }
    } catch(e) {}
}

function save_dark_pref(val) { localStorage.setItem(LS_DARK, val ? '1' : '0'); }
function load_dark_pref()    { return localStorage.getItem(LS_DARK) === '1'; }

function get_last_7_days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    return days;
}

function format_time(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function format_time_short(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

dark_toggle_btn.addEventListener('click', () => {
    is_dark = !is_dark;
    document.body.classList.toggle('dark', is_dark);
    dark_toggle_btn.textContent = is_dark ? '☀️' : '🌙';
    apply_theme(active_face - 1);
    save_dark_pref(is_dark);
});

function apply_theme(face_index) {
    const dark_themes = [
        { bg: '#0f1f10', text: '#a5d6a7', border: '#2d5a2e', dot: '#66bb6a', hover: '#c8e6c9', disabled: '#1a3a1b' },
        { bg: '#0a1628', text: '#90caf9', border: '#1a3a5c', dot: '#42a5f5', hover: '#bbdefb', disabled: '#112244' },
        { bg: '#1a0a2e', text: '#ce93d8', border: '#4a1a6a', dot: '#ab47bc', hover: '#e1bee7', disabled: '#2d1245' },
        { bg: '#2a1500', text: '#ffcc80', border: '#5c3200', dot: '#ffa726', hover: '#ffe0b2', disabled: '#3d2000' },
        { bg: '#2a0a0a', text: '#ef9a9a', border: '#5c1a1a', dot: '#ef5350', hover: '#ffcdd2', disabled: '#3d1212' },
        { bg: '#001a18', text: '#80cbc4', border: '#003d38', dot: '#26a69a', hover: '#b2dfdb', disabled: '#002a26' },
    ];
    const t = is_dark ? dark_themes[face_index] : face_themes[face_index];
    const r = document.documentElement;
    r.style.setProperty('--bg-color',     t.bg);
    r.style.setProperty('--text-color',   t.text);
    r.style.setProperty('--border-color', t.border);
    r.style.setProperty('--dot-color',    t.dot);
    r.style.setProperty('--hover-color',  t.hover);
    r.style.setProperty('--disabled-bg',  t.disabled);
}

function update_face_display(face_num) {
    cube_side.textContent = `FACE ${face_num}`;
    active_task_display.textContent = task_inputs[face_num - 1]?.value || `Face ${face_num}`;
    apply_theme(face_num - 1);
    update_daily_total_card();
}

function update_daily_total_card() {
    const total = face_seconds.reduce((a, b) => a + b, 0);
    const el = document.getElementById('dailytotalstat');
    if (!el) return;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
        el.innerHTML = `<span class="stat-num">${h}<span class="stat-unit">h</span> ${m}<span class="stat-unit">m</span></span>`;
    } else if (m > 0) {
        el.innerHTML = `<span class="stat-num">${m}<span class="stat-unit">m</span> ${s}<span class="stat-unit">s</span></span>`;
    } else {
        el.innerHTML = `<span class="stat-num">${s}<span class="stat-unit">s</span></span>`;
    }
    const top_el = document.getElementById('toptaskstat');
    if (top_el) {
        let max_i = 0;
        face_seconds.forEach((sec, i) => { if (sec > face_seconds[max_i]) max_i = i; });
        const top_name = task_inputs[max_i]?.value || `Face ${max_i + 1}`;
        top_el.textContent = total > 0 ? top_name : '—';
    }
}

function start_live_timer(face_num) {
    stop_live_timer();
    limit_warning.classList.remove('show');
    live_seconds = face_seconds[face_num - 1];
    timer_display.textContent = format_time(live_seconds);
    live_interval = setInterval(() => {
        live_seconds++;
        face_seconds[face_num - 1] = live_seconds;
        timer_display.textContent = format_time(live_seconds);
        update_daily_total_card();
        save_today();
        const limit_val = parseInt(limit_inputs[face_num - 1]?.value) || 0;
        if (limit_val > 0 && live_seconds >= limit_val * 60) {
            limit_warning.classList.add('show');
            limit_warning.textContent = `⏰ Limit reached for ${task_inputs[face_num - 1]?.value || `Face ${face_num}`}!`;
        }
    }, 1000);
}

function stop_live_timer() {
    if (live_interval) { clearInterval(live_interval); live_interval = null; }
}

function render_chart() {
    const total_seconds = face_seconds.reduce((a, b) => a + b, 0);
    const hrs  = Math.floor(total_seconds / 3600);
    const mins = Math.floor((total_seconds % 3600) / 60);
    total_time_display.textContent = hrs > 0 ? `${hrs} hr, ${mins} mins` : `${mins} mins`;

    let gradient_string = '';
    let current_pct = 0;
    legend_container.innerHTML = '';

    if (total_seconds === 0) {
        donut_chart.style.background = '#e0e0e0';
        legend_container.innerHTML = "<p style='grid-column: span 2; text-align: center; color: #666;'>No activity recorded yet.</p>";
        return;
    }

    face_seconds.forEach((sec, index) => {
        if (sec > 0) {
            const pct   = (sec / total_seconds) * 100;
            const start = current_pct;
            const end   = current_pct + pct;
            const color = face_themes[index].dot;
            gradient_string += `${color} ${start}% ${end}%, `;
            current_pct = end;
            const task_name = task_inputs[index].value || `Face ${index + 1}`;
            legend_container.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <div>
                        <div style="color: #333;">${task_name}</div>
                        <div style="font-size: 13px; color: #888; font-weight: normal;">${format_time_short(sec)}</div>
                    </div>
                </div>`;
        }
    });
    gradient_string = gradient_string.slice(0, -2);
    donut_chart.style.background = `conic-gradient(${gradient_string})`;
}

function render_weekly_chart() {
    const weekly_data = load_weekly();
    const days_keys   = get_last_7_days();
    const day_labels  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bars_container = document.getElementById('weeklybars');
    bars_container.innerHTML = '';

    let max_seconds = 0;
    const day_totals = days_keys.map(key => {
        const entry = weekly_data[key];
        const total = entry ? entry.face_seconds.reduce((a, b) => a + b, 0) : 0;
        if (total > max_seconds) max_seconds = total;
        return { key, total, entry };
    });
    if (max_seconds === 0) max_seconds = 3600;

    day_totals.forEach(({ key, total, entry }) => {
        const d          = new Date(key + 'T00:00:00');
        const day_name   = day_labels[d.getDay()];
        const date_str   = `${d.getDate()}/${d.getMonth() + 1}`;
        const height_pct = Math.max((total / max_seconds) * 100, total > 0 ? 4 : 0);
        const is_today   = key === TODAY_KEY;

        let tooltip_html = `<strong>${day_name}, ${date_str}</strong><br>Total: ${format_time_short(total)}`;
        if (entry && total > 0) {
            entry.face_seconds.forEach((sec, i) => {
                if (sec > 0) {
                    const task = entry.tasks?.[i] || `Face ${i + 1}`;
                    tooltip_html += `<br>${task}: ${format_time_short(sec)}`;
                }
            });
        }
        const bar_color = is_today ? 'var(--text-color)' : 'var(--border-color)';
        bars_container.innerHTML += `
            <div class="bar-col">
                <div class="bar-tooltip">${tooltip_html}</div>
                <div class="bar-time">${total > 0 ? format_time_short(total) : ''}</div>
                <div class="bar-wrap">
                    <div class="bar-fill" style="height: ${height_pct}%; background: ${bar_color}; ${is_today ? 'box-shadow: 0 0 12px var(--dot-color)44;' : ''}"></div>
                </div>
                <div class="bar-label">
                    <div class="bar-day" style="${is_today ? 'font-weight: 900; color: var(--text-color);' : ''}">${day_name}</div>
                    <div class="bar-date">${date_str}</div>
                </div>
            </div>`;
    });
}

function generate_key_insights() {
    const weekly_data = load_weekly();
    const days_keys   = get_last_7_days();
    const day_labels  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let total_week_seconds = 0;
    let active_days        = 0;
    let best_day_seconds   = 0;
    let best_day_label     = '';
    const task_week_totals = [0, 0, 0, 0, 0, 0];

    days_keys.forEach(key => {
        const entry = weekly_data[key];
        if (!entry) return;
        const day_total = entry.face_seconds.reduce((a, b) => a + b, 0);
        if (day_total > 0) {
            active_days++;
            total_week_seconds += day_total;
            if (day_total > best_day_seconds) {
                best_day_seconds = day_total;
                const d = new Date(key + 'T00:00:00');
                best_day_label = day_labels[d.getDay()];
            }
            entry.face_seconds.forEach((sec, i) => { task_week_totals[i] += sec; });
        }
    });

    const avg_day_seconds = active_days > 0 ? Math.round(total_week_seconds / active_days) : 0;
    const today_entry     = weekly_data[TODAY_KEY];
    const today_total     = today_entry ? today_entry.face_seconds.reduce((a, b) => a + b, 0) : 0;

    let top_task_index = 0;
    task_week_totals.forEach((sec, i) => { if (sec > task_week_totals[top_task_index]) top_task_index = i; });
    const top_task_name = task_inputs[top_task_index]?.value || `Face ${top_task_index + 1}`;

    const insights    = [];
    const suggestions = [];

    if (active_days === 0) {
        insights.push("You haven't logged any productive time this week yet — today is a great day to start.");
    } else if (active_days === 1) {
        insights.push(`You've been productive on ${active_days} day this week. Building consistency across more days will compound your progress.`);
    } else if (active_days <= 4) {
        insights.push(`You've logged productive time on ${active_days} out of 7 days this week — a solid start.`);
    } else {
        insights.push(`You've been productive on ${active_days} out of 7 days this week — excellent consistency!`);
    }

    if (today_total === 0) {
        insights.push("No time has been tracked today yet.");
    } else if (avg_day_seconds === 0 || today_total >= avg_day_seconds * 1.1) {
        insights.push(`Today you've worked for ${format_time_short(today_total)}, which is above your weekly daily average — great effort.`);
    } else if (today_total >= avg_day_seconds * 0.8) {
        insights.push(`You've put in ${format_time_short(today_total)} today, close to your daily average of ${format_time_short(avg_day_seconds)}.`);
    } else {
        insights.push(`You've tracked ${format_time_short(today_total)} today, which is below your daily average of ${format_time_short(avg_day_seconds)} — there's still time to catch up.`);
    }

    if (best_day_label) {
        insights.push(`Your most productive day this week was ${best_day_label} with ${format_time_short(best_day_seconds)} logged.`);
    }

    if (total_week_seconds > 0) {
        const pct = Math.round((task_week_totals[top_task_index] / total_week_seconds) * 100);
        insights.push(`Your most-worked task this week is <strong>${top_task_name}</strong>, accounting for ${pct}% of your total productive time.`);
    }

    if (total_week_seconds > 0) {
        const target_week = 7 * 2 * 3600; 
        if (total_week_seconds >= target_week) {
            insights.push(`You've hit ${format_time_short(total_week_seconds)} of productive time this week — you're having a strong week!`);
        } else {
            const remaining = format_time_short(target_week - total_week_seconds);
            insights.push(`You've logged ${format_time_short(total_week_seconds)} this week. About ${remaining} more would reach a solid 14-hour weekly target.`);
        }
    }

    if (active_days < 5) {
        suggestions.push("Try to log at least 5 active days a week — even 20 minutes on slow days builds the habit.");
    }
    if (avg_day_seconds < 3600 && active_days > 0) {
        suggestions.push("Your average session is under an hour. Aiming for 1–2 focused hours per day will make a noticeable difference.");
    }
    if (total_week_seconds > 0) {
        const other_tasks_total = task_week_totals.reduce((a, b) => a + b, 0) - task_week_totals[top_task_index];
        if (other_tasks_total < task_week_totals[top_task_index] * 0.3) {
            suggestions.push(`You're heavily focused on ${top_task_name}. Make sure other subjects are getting adequate attention too.`);
        }
    }
    if (today_total > 4 * 3600) {
        suggestions.push("You've logged over 4 hours today — remember to take regular breaks to avoid burnout.");
    } else if (today_total === 0 && active_days > 0) {
        suggestions.push("You haven't started today yet. Even a short session now will keep your momentum going.");
    }
    if (suggestions.length === 0) {
        suggestions.push("Keep up the great work! Review your task balance weekly to stay on top of all subjects.");
    }

    let html = `<div style="margin-bottom:12px; font-size:15px; line-height:1.8; color:var(--subtext);">${insights.join(' ')}</div>`;
    html += `<div style="margin-top:14px; padding-top:12px; border-top: 1px solid var(--border-color);">`;
    html += `<div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--subtext); margin-bottom:10px; font-weight:700;">Ways to Improve</div>`;
    suggestions.forEach(s => {
        html += `<div style="font-size:14px; color:var(--subtext); margin-bottom:8px; padding-left:12px; border-left:3px solid var(--dot-color); line-height:1.5;">💡 ${s}</div>`;
    });
    html += `</div>`;

    ai_summary_text.innerHTML = html;
    ai_summary_box.style.display = 'block';
}

view_stats_btn.addEventListener('click', () => {
    main_view.style.display = 'none';
    stats_view.style.display = 'flex';
    render_chart();
});

back_btn.addEventListener('click', () => {
    stats_view.style.display = 'none';
    main_view.style.display = 'grid';
});

view_detailed_btn.addEventListener('click', () => {
    stats_view.style.display = 'none';
    weekly_view.style.display = 'flex';
    render_weekly_chart();
    generate_key_insights();
});

back_from_weekly_btn.addEventListener('click', () => {
    weekly_view.style.display = 'none';
    stats_view.style.display = 'flex';
    ai_summary_box.style.display = 'none';
});

function parse_string(line) {
    if (!line) return;
    line = line.trim();
    if (line === '') return;

    if (line === 'SYSTEM RESET') {
        show_toast('✅ Hardware flash wiped successfully!');
        return;
    }

    const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
    if (match) {
        const face    = parseInt(match[1]);
        let   seconds = parseInt(match[2]);
        if (seconds > Number.MAX_SAFE_INTEGER) seconds = Number.MAX_SAFE_INTEGER;
        if (face !== last_face) {
            last_face = face;
            active_face = face;
            face_seconds[face - 1] = seconds;
            face_selector.value = face;
            update_face_display(face);
            start_live_timer(face);
        }
    }
}

async function connect_serial() {
    try {
        set_connection_ui('connecting');
        serial_port = await navigator.serial.requestPort();
        await serial_port.open({ baudRate: 115200 });
        set_connection_ui('connected');
        show_toast('Connected!');

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(serial_port.writable);
        serial_writer = encoder.writable.getWriter();

        const decoder = new TextDecoderStream();
        serial_port.readable.pipeTo(decoder.writable);
        serial_reader = decoder.readable.getReader();

        while (true) {
            const { value, done } = await serial_reader.read();
            if (done) break;
            if (value) {
                receive_buffer += value;
                let nl;
                while ((nl = receive_buffer.indexOf('\n')) !== -1) {
                    const line = receive_buffer.slice(0, nl);
                    receive_buffer = receive_buffer.slice(nl + 1);
                    parse_string(line);
                }
            }
        }
    } catch(e) {
        set_connection_ui('disconnected');
        show_toast('Error: ' + e.message);
    }
}

reset_btn.addEventListener('click', async () => {
    const confirmed = confirm(
        '⚠️ Reset Hardware?\n\n' +
        'This will permanently wipe ALL activity data from the cube\'s flash memory.\n\n' +
        'Note: Your data saved on this device (local storage) is kept safe and will still be shown here.\n\n' +
        'Proceed?'
    );
    if (!confirmed) return;

    if (!serial_writer) {
        show_toast('Connect the cube first before resetting hardware.');
        return;
    }

    try {
        await serial_writer.write('RESET\n');
        show_toast('🔄 Reset command sent to hardware...');
    } catch(e) {
        show_toast('Failed to send reset: ' + e.message);
    }
});

function set_connection_ui(state) {
    if (state === 'connected') {
        status_dot.classList.add('connected');
        status_text.textContent = 'Cube connected';
        connect_btn.textContent = 'Disconnect';
        connect_btn.dataset.state = 'connected';
    } else if (state === 'connecting') {
        status_text.textContent = 'Connecting...';
        connect_btn.disabled = true;
    } else {
        status_dot.classList.remove('connected');
        status_text.textContent = 'Cube disconnected';
        connect_btn.textContent = 'Connect Cube';
        connect_btn.dataset.state = 'disconnected';
        connect_btn.disabled = false;
        serial_writer = null;
    }
}

const validate_task_inputs = () => {
    let all_filled = true;
    task_inputs.forEach(input => { if (input.value.trim() === '') all_filled = false; });
    save_tasks_btn.disabled = !all_filled;
};

task_inputs.forEach(input => input.addEventListener('input', validate_task_inputs));

open_settings_btn.addEventListener('click', () => {
    side_bar.classList.add('open');
    over_lay.classList.add('show');
    validate_task_inputs();
});

const close_sidebar = () => {
    side_bar.classList.remove('open');
    over_lay.classList.remove('show');
};

close_settings_btn.addEventListener('click', close_sidebar);
over_lay.addEventListener('click', close_sidebar);

save_tasks_btn.addEventListener('click', () => {
    update_face_display(active_face);
    save_tasks_and_limits();
    save_today();
    show_toast('Tasks saved!');
    close_sidebar();
});

connect_btn.addEventListener('click', async () => {
    if (!('serial' in navigator)) {
        show_toast('Web Serial API is not supported in this browser. Try Chrome or Edge.');
        return;
    }
    if (connect_btn.dataset.state === 'connected') {
        stop_live_timer();
        if (serial_reader) await serial_reader.cancel();
        try { if (serial_writer) serial_writer.close(); } catch(e) {}
        if (serial_port) await serial_port.close();
        set_connection_ui('disconnected');
    } else {
        await connect_serial();
    }
});

face_selector.addEventListener('input', () => {
    let num = parseInt(face_selector.value);
    if (num > 6) num = 6; else if (num < 1) num = 1;
    face_selector.value = num;
    active_face = num;
    update_face_display(num);
});

function show_toast(msg) {
    let el = document.getElementById('cube-toast') || document.createElement('div');
    el.id = 'cube-toast';
    el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; z-index:9999; transition:opacity 0.4s;`;
    if (!el.parentElement) document.body.appendChild(el);
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

(function init() {
    is_dark = load_dark_pref();
    if (is_dark) {
        document.body.classList.add('dark');
        dark_toggle_btn.textContent = '☀️';
    }

    load_tasks_and_limits();
    load_today_from_storage();

    update_face_display(active_face);
    timer_display.textContent = '00:00';
    update_daily_total_card();
})();
