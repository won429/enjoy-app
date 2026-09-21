// 2026 아시안게임 국가대표 선수 사진. KBO 구단 사진 매핑과 별도로 사용한다.
// 사용자가 제공한 asian-games-2026-player-images.js의 24명 명단과 사진 ID.
(function () {
    const players = [
        ['김영우', 'LG', '투수', '55167'],
        ['문보경', 'LG', '내야수', '69102'],
        ['노시환', '한화', '내야수', '69737'],
        ['문현빈', '한화', '내야수', '53764'],
        ['조병현', 'SSG', '투수', '51897'],
        ['조형우', 'SSG', '포수', '51865'],
        ['정준재', 'SSG', '내야수', '54812'],
        ['배찬승', '삼성', '투수', '55455'],
        ['이재현', '삼성', '내야수', '52415'],
        ['김지찬', '삼성', '외야수', '50458'],
        ['김주원', 'NC', '내야수', '51907'],
        ['박영현', 'KT', '투수', '52060'],
        ['소형준', 'KT', '투수', '50030'],
        ['오원석', 'KT', '투수', '50859'],
        ['최준용', '롯데', '투수', '50556'],
        ['김진욱', '롯데', '투수', '51516'],
        ['윤동희', '롯데', '외야수', '52591'],
        ['성영탁', 'KIA', '투수', '54610'],
        ['김도영', 'KIA', '내야수', '52605'],
        ['박재현', 'KIA', '외야수', '55636'],
        ['곽빈', '두산', '투수', '68220'],
        ['최민석', '두산', '내야수', '55268'],
        ['박준순', '두산', '내야수', '55252'],
        ['김건희', '키움', '포수', '53312']
    ].map(function (entry) {
        return Object.freeze({
            name: entry[0],
            team: entry[1],
            position: entry[2],
            image: 'https://sports-phinf.pstatic.net/player/kbo/default/' + entry[3] + '.png?type=w150'
        });
    });
    window.enjoyAsianGamesRoster2026 = Object.freeze(players);
    window.enjoyAsianGamesPlayerImages = Object.freeze(Object.fromEntries(players.map(function (player) {
        return [player.name, player.image];
    })));
})();
