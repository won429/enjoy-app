// Shared by the date list, calendar and game detail. No schedule data is bundled.
(function () {
    const flags = {};
    const colors = {};
    // Flag-inspired tones, dark enough to support white scoreboard text.
    const countryColors = {
        KOR: '#C7354C', TPE: '#2455A4', HKG: '#BA2537', THA: '#353568',
        JPN: '#AB2547', CHN: '#BE3036', PHI: '#2458A0', PLE: '#167552'
    };
    [
        ['KOR', '한국', '대한민국'], ['TPE', '대만', '차이니스 타이베이', '차이니즈 타이베이', '중화 타이베이'],
        ['HKG', '홍콩', '홍콩 차이나'], ['THA', '태국'], ['JPN', '일본'],
        ['CHN', '중국'], ['PHI', '필리핀', 'PHL'], ['PLE', '팔레스타인', 'PSE']
    ].forEach(function (names) {
        const image = 'baseball-assets/flags/' + names[0] + '.png';
        names.forEach(function (name) { flags[name] = image; colors[name] = countryColors[names[0]]; });
    });
    Object.freeze(flags);
    Object.freeze(colors);
    function teamName(value) {
        const name = String(value || '').trim();
        return name === '한국' || name === '대한민국' || name.toUpperCase() === 'KOR' ? '대한민국' : name;
    }
    function isAsianGames(game) {
        const competition = String(game.competition || game.league || '').trim();
        if (competition) return /^(asian[-_ ]?games|아시안\s*게임)$/i.test(competition);
        return [game.awayTeam || game.team1, game.homeTeam || game.team2].some(function (team) {
            return teamName(team) === '대한민국';
        });
    }
    window.enjoyBaseballCompetition = { teamName: teamName, isAsianGames: isAsianGames, flags: flags, colors: colors };
})();
