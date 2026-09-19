export type Provider = {
  id: string;
  name: string;
  website: string;
  regions: string[];
  family: string;
  webMode: 'official-site';
};

const directory = 'https://www.kogas.or.kr/site/koGas/1020408040000';

// Android source catalog at ac6eb498fa90e00c4f5475c31566c573053dbad2.
// This web app only links to official sites. It does not authenticate, read,
// or submit information to a supplier.
export const providers: Provider[] = [
  { id: 'busan', name: '부산도시가스', website: 'https://www.skens.com/busan/login/login.do', regions: ['부산'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'seoul', name: '서울도시가스', website: 'https://www.seoulgas.co.kr/', regions: ['서울', '경기'], family: '가스앱', webMode: 'official-site' },
  { id: 'yesco', name: '예스코', website: 'https://www.lsyesco.com/', regions: ['서울', '경기'], family: '가스앱', webMode: 'official-site' },
  { id: 'samchully', name: '삼천리', website: 'https://cs.samchully.co.kr/', regions: ['경기', '인천'], family: '삼천리', webMode: 'official-site' },
  { id: 'incheon', name: '인천도시가스', website: 'https://icgas.co.kr:8443/', regions: ['인천', '경기'], family: '가스앱', webMode: 'official-site' },
  { id: 'daeryun', name: '대륜E&S', website: 'https://www.daeryunens.com/', regions: ['서울', '경기'], family: '가스앱', webMode: 'official-site' },
  { id: 'kiturami', name: '귀뚜라미에너지', website: 'https://www.kituramienergy.co.kr/', regions: ['서울'], family: '가스앱', webMode: 'official-site' },
  { id: 'koone', name: '코원에너지서비스', website: 'https://www.skens.com/koone/login/login.do', regions: ['서울', '경기'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'cheongju', name: '충청에너지서비스', website: 'https://www.skens.com/cheongju/login/login.do', regions: ['충북', '세종'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'gumi', name: '영남에너지서비스 구미', website: 'https://www.skens.com/gumi/login/login.do', regions: ['경북'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'pohang', name: '영남에너지서비스 포항', website: 'https://www.skens.com/pohang/login/login.do', regions: ['경북'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'jeonnam', name: '전남도시가스', website: 'https://www.skens.com/jeonnam/login/login.do', regions: ['전남'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'gangwon', name: '강원도시가스', website: 'https://www.skens.com/gangwon/login/login.do', regions: ['강원'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'jeonbuk', name: '전북에너지서비스', website: 'https://www.skens.com/jeonbuk/login/login.do', regions: ['전북'], family: 'SK E&S', webMode: 'official-site' },
  { id: 'jb', name: 'JB', website: 'https://www.jbcorporation.com/', regions: ['충남', '세종'], family: '가스앱', webMode: 'official-site' },
  { id: 'jeonbukgas', name: '전북도시가스', website: 'https://www.jbcitygas.co.kr/', regions: ['전북'], family: '가스앱', webMode: 'official-site' },
  { id: 'gunsan', name: '군산도시가스', website: 'https://www.kscg.co.kr/', regions: ['전북'], family: '가스앱', webMode: 'official-site' },
  { id: 'jeju', name: '제주도시가스', website: 'https://www.jejucitygas.com/', regions: ['제주'], family: '가스앱', webMode: 'official-site' },
  { id: 'kyungdong', name: '경동도시가스', website: 'https://www.kdgas.co.kr/', regions: ['울산', '경남'], family: '가스앱', webMode: 'official-site' },
  { id: 'cncity', name: 'CNCITY에너지', website: 'https://www.cncityenergy.com/', regions: ['대전', '충남'], family: 'EnergyTalk', webMode: 'official-site' },
  { id: 'daesung', name: '대성에너지', website: 'https://www.daesungenergy.com/', regions: ['대구', '경북'], family: '직접 공급사 포털', webMode: 'official-site' },
  { id: 'daesungclean', name: '대성청정에너지', website: 'https://www.daesungcleanenergy.co.kr/', regions: ['대구', '경북'], family: '직접 공급사 포털', webMode: 'official-site' },
  { id: 'knenergy', name: '경남에너지', website: 'https://www.knenergy.co.kr/', regions: ['경남'], family: 'EnergyTalk', webMode: 'official-site' },
  { id: 'seorabeol', name: '서라벌도시가스', website: 'https://www.srbgas.co.kr/', regions: ['경북'], family: 'EnergyTalk', webMode: 'official-site' },
  { id: 'gse', name: '지에스이', website: 'https://www.yesgse.com/', regions: ['경남'], family: 'EnergyTalk', webMode: 'official-site' },
  { id: 'haeyang', name: '해양에너지', website: 'https://www.hyenergy.co.kr/', regions: ['광주', '전남'], family: '직접 공급사 포털', webMode: 'official-site' },
  { id: 'chambit', name: '참빛도시가스 계열', website: directory, regions: ['강원', '충북'], family: '가스앱', webMode: 'official-site' },
  { id: 'mcenergy', name: 'MC에너지 (목포도시가스)', website: 'https://www.mokpocitygas.co.kr/', regions: ['전남'], family: '가스앱', webMode: 'official-site' },
  { id: 'seohae', name: '미래엔서해에너지', website: 'https://www.shgas.co.kr/', regions: ['충남'], family: '가스앱', webMode: 'official-site' },
  { id: 'daehwa', name: '대화도시가스', website: 'https://www.dhgas.com/', regions: ['전남'], family: '가스앱', webMode: 'official-site' },
  { id: 'myungsung', name: '명성파워그린', website: directory, regions: ['강원'], family: '직접 입력', webMode: 'official-site' },
  { id: 'other', name: '다른 공급사 / 직접 입력', website: directory, regions: ['전국'], family: '직접 입력', webMode: 'official-site' },
];

const fallbackProvider = providers.find((provider) => provider.id === 'other')!;

export function getProvider(id: string): Provider {
  return providers.find((provider) => provider.id === id) ?? fallbackProvider;
}
