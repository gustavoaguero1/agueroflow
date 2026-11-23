import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { auth } from './firebase.ts';
import { setApiTokenGetter, apiFetch } from './apiAuthFetch.ts';

setApiTokenGetter(() => auth.currentUser?.getIdToken() ?? Promise.resolve(null));
// Console diagnostics with the signed-in user's token, e.g. apiFetch('/api/protheus/diagnostico').then(r => r.json()).then(console.log)
(window as unknown as { apiFetch: typeof apiFetch }).apiFetch = apiFetch;

createRoot(document.getElementById('root')!).render(<App />);
