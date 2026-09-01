import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CACHE_TTL_MS = 60_000;
const MAX_CALENDARS = 8;
const cache = new Map();

let client = null;

function getClient() {
  if (client) return client;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.');
  }

  const key = JSON.parse(raw);
  client = new JWT({
    email: key.client_email,
    key: key.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  return client;
}

/**
 * GOOGLE_CALENDAR_ID 를 파싱한다.
 * 쉼표로 여러 개를 구분하고, "라벨=캘린더ID" 형식으로 표시 이름을 지정할 수 있다.
 *   예) 수업=abc@group.calendar.google.com, 개인=me@gmail.com
 * 라벨을 생략하면 구글에 등록된 캘린더 이름을 그대로 쓴다.
 */
function parseCalendars() {
  const raw = process.env.GOOGLE_CALENDAR_ID || '';
  return raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, MAX_CALENDARS)
    .map((chunk) => {
      const at = chunk.indexOf('=');
      if (at > 0) {
        return { label: chunk.slice(0, at).trim(), id: chunk.slice(at + 1).trim() };
      }
      return { label: null, id: chunk };
    });
}

function isValidIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function sanitize(item, calIndex) {
  return {
    id: item.id,
    title: item.summary || '(제목 없음)',
    allDay: Boolean(item.start?.date),
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    cal: calIndex,   // 위젯에서 색을 구분하는 데 사용
  };
}

async function fetchCalendar(token, cal, index, timeMin, timeMax) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
  );
  url.searchParams.set('timeMin', new Date(timeMin).toISOString());
  url.searchParams.set('timeMax', new Date(timeMax).toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    // 캘린더 하나가 실패해도 나머지는 계속 보여준다
    console.error('Calendar API 오류', cal.id, res.status, await res.text());
    return { name: cal.label || cal.id, index, ok: false, events: [], timeZone: null };
  }

  const body = await res.json();
  return {
    name: cal.label || body.summary || cal.id,
    index,
    ok: true,
    timeZone: body.timeZone || null,
    events: (body.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => sanitize(item, index)),
  };
}

export default async function handler(req, res) {
  const { timeMin, timeMax } = req.query;

  if (!isValidIso(timeMin) || !isValidIso(timeMax)) {
    res.status(400).json({ error: 'timeMin, timeMax를 ISO 8601 형식으로 보내주세요.' });
    return;
  }

  const span = Date.parse(timeMax) - Date.parse(timeMin);
  if (span <= 0 || span > 40 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ error: '조회 기간은 0보다 크고 40일 이내여야 합니다.' });
    return;
  }

  const calendars = parseCalendars();
  if (calendars.length === 0) {
    res.status(500).json({ error: 'GOOGLE_CALENDAR_ID 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const cacheKey = `${timeMin}|${timeMax}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(hit.data);
    return;
  }

  try {
    const auth = getClient();
    const { token } = await auth.getAccessToken();

    // 캘린더를 병렬로 조회한다
    const results = await Promise.all(
      calendars.map((cal, i) => fetchCalendar(token, cal, i, timeMin, timeMax))
    );

    if (results.every((r) => !r.ok)) {
      res.status(502).json({ error: '캘린더를 불러오지 못했습니다.' });
      return;
    }

    const data = {
      timeZone: results.find((r) => r.timeZone)?.timeZone || 'UTC',
      calendars: results.map((r) => ({ name: r.name, index: r.index, ok: r.ok })),
      events: results
        .flatMap((r) => r.events)
        .sort((a, b) => new Date(a.start) - new Date(b.start)),
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { at: Date.now(), data });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 설정을 확인해주세요.' });
  }
}
