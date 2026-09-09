// Shared by the date list, calendar and game detail. No schedule data is bundled.
(function () {
    function teamName(value) {
        const name = String(value || '').trim();
        return name === '대한민국' || name.toUpperCase() === 'KOR' ? '한국' : name;
    }
    function isAsianGames(game) {
        const competition = String(game.competition || game.league || '').trim();
        if (competition) return /^(asian[-_ ]?games|아시안\s*게임)$/i.test(competition);
        return [game.awayTeam || game.team1, game.homeTeam || game.team2].some(function (team) {
            return teamName(team) === '한국';
        });
    }
    window.enjoyBaseballCompetition = { teamName: teamName, isAsianGames: isAsianGames };
})();
