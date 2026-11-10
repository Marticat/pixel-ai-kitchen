import type {Metadata} from 'next';
import './globals.css';
import './live.css';
export const metadata:Metadata={title:"AI Kitchen — a team of models",description:"A pixel-art kitchen powered by OpenAI and Anthropic models.",icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
