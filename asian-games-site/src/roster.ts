// Owner-supplied names. Specs below are placeholders explicitly requested by the owner.
// Received character artwork; other players keep the placeholder.
const suppliedCharacters=new Set(["배찬승", "곽빈", "문보경", "김지찬", "김주원", "김도영", "이재현", "김영우", "김진욱", "노시환", "박재현", "김건희"]);
export const roster=['곽빈','김건희','김도영','김영우','김주원','김지찬','김진욱','노시환','문보경','문현빈','박영현','박재현','박준순','배찬승','성영탁','소형준','오원석','윤동희','이재현','정준재','조병현','조형우','최민석','최준용'].map((name,index)=>({id:'kor-'+String(index+1).padStart(2,'0'),name,position:['투수','포수','내야수','외야수'][index%4],bats:'우투우타',height:180+index%8,weight:80+index%12,image:suppliedCharacters.has(name)?'./baseball-assets/players/kor-'+String(index+1).padStart(2,'0')+'.png':'',number:'',club:'',description:''}));
