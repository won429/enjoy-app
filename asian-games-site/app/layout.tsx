import type { Metadata } from 'next';
import '../src/index.css';
export const metadata:Metadata={title:'2026 아시안게임 야구',description:'대한민국 야구, 다음 승부를 향해. 아시안게임 경기 일정과 경기정보를 만나보세요.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
