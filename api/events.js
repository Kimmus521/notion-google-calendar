import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CACHE_TTL_MS = 60_000;
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
    // Vercel 환경변수에 \n 이 이스케이프된 상태로 저장되는 경우를 처리
    key: key.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  return client;
}

function isValidIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Calendar API 응답에서 위젯이 실제로 쓰는 필드만 남긴다.
 * 참석자, 설명, 첨부파일, 회의 링크 등은 브라우저로 내려보내지 않는다.
 */
function sanitize(item) {
  const allDay = Boolean(item.start?.date);
  return {
    id: item.id,
    title: item.summary || '(제목 없음)',
    allDay,
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
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

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
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

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set('timeMin', new Date(timeMin).toISOString());
    url.searchParams.set('timeMax', new Date(timeMax).toISOString());
    url.searchParams.set('singleEvents', 'true'); // 반복 일정을 개별 일정으로 펼침
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');

    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Calendar API 오류', upstream.status, detail);
      res.status(502).json({ error: '캘린더를 불러오지 못했습니다.' });
      return;
    }

    const body = await upstream.json();
    const data = {
      timeZone: body.timeZone || 'UTC',
      events: (body.items || [])
        .filter((item) => item.status !== 'cancelled')
        .map(sanitize),
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
