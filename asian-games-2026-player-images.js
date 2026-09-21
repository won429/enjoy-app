// 2026 아시안게임 국가대표 선수 사진. KBO 구단 사진 매핑과 별도로 사용한다.
// 사용자가 제공한 아시안게임 전용 선수 사진 URL과 24명 명단.
(function () {
    const players = [
        ['김영우', 'LG', '투수', '100127'],
        ['문보경', 'LG', '내야수', '100142'],
        ['노시환', '한화', '내야수', '100141'],
        ['문현빈', '한화', '내야수', '100147'],
        ['조병현', 'SSG', '투수', '100134'],
        ['조형우', 'SSG', '포수', '100138'],
        ['정준재', 'SSG', '내야수', '100145'],
        ['배찬승', '삼성', '투수', '100130'],
        ['이재현', '삼성', '내야수', '100144'],
        ['김지찬', '삼성', '외야수', '100146'],
        ['김주원', 'NC', '내야수', '100140'],
        ['박영현', 'KT', '투수', '100129'],
        ['소형준', 'KT', '투수', '100132'],
        ['오원석', 'KT', '투수', '100133'],
        ['최준용', '롯데', '투수', '100136'],
        ['김진욱', '롯데', '투수', '100128'],
        ['윤동희', '롯데', '외야수', '100149'],
        ['성영탁', 'KIA', '투수', '100131'],
        ['김도영', 'KIA', '내야수', '100139'],
        ['박재현', 'KIA', '외야수', '100148'],
        ['곽빈', '두산', '투수', '100126'],
        ['최민석', '두산', '내야수', '100135'],
        ['박준순', '두산', '내야수', '100143'],
        ['김건희', '키움', '포수', '100137']
    ].map(function (entry) {
        return Object.freeze({
            name: entry[0],
            team: entry[1],
            position: entry[2],
            image: 'https://sports-phinf.pstatic.net/player/asiangames2026/default/' + entry[3] + '.png'
        });
    });
    window.enjoyAsianGamesRoster2026 = Object.freeze(players);
    window.enjoyAsianGamesPlayerImages = Object.freeze(Object.fromEntries(players.map(function (player) {
        return [player.name, player.image];
    })));
})();
