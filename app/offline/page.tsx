import Link from "next/link";

export default function OfflinePage() { return <main className="offline-page"><p className="eyebrow">FinMate AI</p><h1>You’re offline.</h1><p>Reconnect to safely load your latest financial workspace. No account data is cached by this app.</p><Link className="button primary" href="/">Try again</Link></main>; }
