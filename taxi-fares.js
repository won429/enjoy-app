(function (root) {
    'use strict';
    // 중형택시 전용. 2026-10-27 확인. 원문과 적용 범위는 각 항목에 보관한다.
    const metroNight = [[0, 2, 30], [2, 4, 20], [23, 24, 20]];
    const night23 = [[0, 4, 20], [23, 24, 20]];
    const night22 = [[0, 4, 20], [22, 24, 20]];
    const night00 = [[0, 4, 20]];
    const normal = [['normal', '일반 구간']];
    const standard = { unitFare: 100, slowSpeed: 15, night: night23, outside: 20, routes: normal, zones: [['0', '일반 · 미적용'], ['outside', '시계외']], rounding: 'round' };
    const profiles = {};
    function add(id, group, name, base, baseDistance, distanceUnit, timeUnit, extra) {
        profiles[id] = { ...standard, id, group, name, base, baseDistance, distanceUnit, timeUnit, ...extra };
    }
    add('seoul', '서울', '서울', 4800, 1600, 131, 30, { slowSpeed: 15.72, night: [[0, 2, 40], [2, 4, 20], [22, 23, 20], [23, 24, 40]], combination: 'sum', source: 'https://news.seoul.go.kr/traffic/archives/1659', note: '서울 복귀·광명·공동사업구역 등 시계외 면제 조건을 확인해 주세요.' });
    add('daegu', '대구', '대구', 4500, 1700, 125, 31, { night: metroNight, outside: 35, combined: 40, source: 'https://www.daegu.go.kr/tra/index.do?menu_id=00000647', note: '심야와 시계외가 겹치면 40%예요. 공동사업구역·귀로 운행의 면제 여부를 확인해 주세요.' });
    add('daejeon', '대전', '대전', 4300, 1800, 132, 33, { night: metroNight, outside: 30, combined: 50, source: 'https://www.daejeon.go.kr/drh/administration/board/boardGalleryView.do?boardId=gallery_0019&menuSeq=4637&ntatcSeq=1508657872&pageIndex=1', future: { at: Date.parse('2026-11-01T00:00:00+09:00'), base: 4800, baseDistance: 1650, distanceUnit: 125, timeUnit: 29 }, note: '2026.11.1부터 1.65km 4,800원·125m/29초당 100원으로 바뀌어요. 출발일 기준으로 적용해요. 심야·시계외 중복은 50%예요.', futureSource: 'https://www.daejeon.go.kr/drh/board/boardNormalView.do?boardId=normal_0189&menuSeq=1632&ntatcSeq=1525249286&pageIndex=1&recordCountPerPage=10&searchCondition=&searchKeyword=' });
    add('gwangju', '광주', '광주', 4800, 1700, 132, 32, { night: metroNight, outside: 35, combined: 50, zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 일반 35%'], ['outside40', '담양·장성·함평·나주 40%']], source: 'https://gntx.kr/information/information_02_1.php', note: '심야·시계외 중복은 50%예요. 나주혁신도시의 도착요금 30% 가산은 이 미터기에서 지원하지 않아요.' });
    add('busan', '부산', '부산', 4800, 2000, 132, 33, { night: metroNight, outside: 30, combined: { 20: 40, 30: 50 }, source: 'https://www.bstaxi.co.kr/?mid=fee', note: '시계외는 30%, 심야와 겹치면 40% 또는 00~02시 50%예요.' });
    add('gumi', '경북', '구미', 4500, 1700, 128, 30, { routes: [['normal', '동 ↔ 동·읍·면'], ['rural', '읍·면 ↔ 읍·면'], ['outer', '시계외 목적지']], zones: [['0', '출발 때 선택한 기준']], tiers: { normal: [[3000, 30], [8000, 50]], rural: [[1700, 38], [8000, 55]], outer: [[1700, 38], [8000, 55]] }, source: 'https://www.gumi.go.kr/traffic/contents.do?mid=0105020000', note: '동 연계는 3km 이후 30%·8km 이후 50%, 읍면 간·시계외는 기본거리 이후 38%·8km 이후 55%예요. 원호·문성·산동확장단지는 읍면 복합 대상에서 제외돼요.' });
    add('chilgok', '경북', '칠곡', 4500, 1700, 128, 30, { zones: [['0', '거리별 복합할증 자동']], tiers: { normal: [[2000, 50], [3000, 60]] }, distanceOnly: true, adjustment: { at: 3000, percent: 9.5 }, source: 'https://www.chilgok.go.kr/portal/contents.do?mId=1101030000', note: '2~3km 거리운임 50%, 3km 지점에서 이전요금 9.5% 가산, 이후 거리운임 60%를 적용해요. 군계외 별도 중복 계산은 지원하지 않아요.' });
    add('andong', '경북', '안동', 4500, 1700, 128, 30, { routes: [['normal', '시내·시내 ↔ 읍면'], ['rural', '읍면 ↔ 읍면']], tiers: { normal: [[4000, 100], [7000, 50]], rural: [[1700, 60], [4000, 100], [7000, 80]] }, ruralBase: 1000, distanceOnly: true, source: 'https://www.andong.go.kr/portal/saeol/gosi/view.do?isLinkage=Y&mId=0401020200&notAncmtMgtNo=61298', note: '4~7km 거리운임 100%, 7km 이후 시내 연계 50%·읍면 간 80%예요. 읍면 간은 기본 1,000원과 1.7~4km 거리운임 60%를 가산해요. 예천 호명 신도시는 시계외 제외예요.' });
    add('cheonan', '충남', '천안', 4000, 1400, 110, 30, { night: [[0, 4, 30], [22, 24, 30]], outside: 32, combination: 'sum', source: 'https://transport.chungnam.go.kr/guide/chargeTaxi.do', note: '22~04시 30%, 시계외 32%, 중복 62%예요. KTX천안아산역 공동사업구역 등 면제 구간을 확인해 주세요.' });
    add('asan', '충남', '아산', 4000, 1400, 105, 30, { night: [[0, 4, 30], [22, 24, 30]], outside: 32, combination: 'unverified', source: 'https://transport.chungnam.go.kr/guide/chargeTaxi.do', note: '아산은 천안과 달리 105m당 100원이에요. 심야 22~04시 30%, 시계외 32%예요. 공동사업구역·귀로 면제 여부를 확인해 주세요. 심야·시계외 중복 계산은 지원하지 않아요.' });
    add('naju', '전남', '나주', 4300, 2000, 130, 30, { unitFare: 140, night: night00, outside: 35, combined: 40, source: 'https://www.naju.go.kr/www/field_info/traffic/taxi', note: '거리·시간 단위요금은 140원이에요. 심야 00~04시 20%, 시계외 35%, 중복 40%예요. 귀로 시계외 할증은 제외해 주세요.' });
    add('yeosu', '전남', '여수', 4300, 2000, 130, 30, { night: night00, outside: 35, combined: 40, tiers: { normal: [[9000, 40]] }, source: 'https://news.yeosu.go.kr/news/articleView.html?idxno=33691', note: '9km 이후 거리·시간 단위요금이 140원으로 바뀌어요. 심야 00~04시 20%, 시계외 35%, 중복은 40%예요. 도서지역 별도 운임은 제외해요.' });
    add('mokpo', '전남', '목포', 4300, 2000, 130, 30, { night: night00, outside: 20, routes: [['normal', '목포 ↔ 남악 포함 관내'], ['outer', '목포 출발 → 시계외'], ['namak', '남악 출발 → 시계외']], zones: [['0', '출발 때 선택한 기준']], source: 'https://www.mokpo.go.kr/www/mokpo_news/notice?idx=519671&mode=view', note: '남악신도시는 공동사업구역이에요. 시계외 목적지는 승차지점부터 단위요금 160원, 남악 출발은 기본 5,000원을 적용해요. 기본요금에는 시계외 할증을 더하지 않아요.' });
    add('jinju', '경남', '진주', 4600, 2000, 128, 30, { night: night22, outside: 30, combined: 50, zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 30%'], ['rural35', '읍면 복합구간 · 35%']], source: 'https://www.newsjinju.kr/news/articleView.html?idxno=58887', note: '심야·시계외 중복은 50%예요. 읍면 복합할증은 35%이며 해제구간·할증 표지판을 확인해 주세요.' });
    add('changwon', '경남', '창원', 4600, 2000, 128, 30, { night: night22, outside: 30, combination: 'unverified', zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 30%'], ['rural20', '동 → 읍면 · 20%'], ['rural40', '읍면 간·읍면 내 · 40%']], source: 'https://www.changwon.go.kr/cwportal/depart/11064/13589/13593.web', note: '동→읍면은 할증 시점 표지판부터 20%, 읍면 간·내는 40%예요. 감계·무동 등 면제 구역은 일반으로 두세요.' });
    add('gimhae', '경남', '김해', 4600, 2000, 128, 30, { night: night22, outside: 30, combination: 'unverified', zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 30%'], ['rural40', '읍면 복합구간 · 40%']], source: 'https://cbtaxi.or.kr/board/index.html?asort=recent&id=news&no=1339&page=51', note: '동지역·주촌면 선천지구·진영읍 원도심과 신도시는 복합할증 제외예요. 그 밖의 해당 읍면 구간에서 40%를 선택해 주세요.' });
    add('yangsan', '경남', '양산', 4600, 2000, 128, 30, { night: night22, outside: 30, combination: 'max', zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 30%'], ['rural30', '원동면 오지 · 30%']], source: 'https://yangsan.go.kr/portal/contents.do?mid=0607080000', note: '심야·시계외·원동면 오지 할증을 중복하지 않고 높은 요율만 적용해요. 상북·하북 오지 할증은 폐지됐어요.' });
    Object.values(profiles).forEach(p => Object.freeze(p));
    const api = Object.freeze({ profiles: Object.freeze(profiles) });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyTaxiFares = api;
})(typeof window !== 'undefined' ? window : globalThis);
