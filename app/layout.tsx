import type {Metadata} from 'next';
import './globals.css';
import './live.css';
export const metadata:Metadata={title:'ИИ-кухня — команда моделей',description:'Пиксельная кухня с исполнителями OpenAI и Anthropic.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body>{children}</body></html>;}
