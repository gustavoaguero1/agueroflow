import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { auth } from './firebase.ts';
import { setApiTokenGetter } from './apiAuthFetch.ts';

setApiTokenGetter(() => auth.currentUser?.getIdToken() ?? Promise.resolve(null));

createRoot(document.getElementById('root')!).render(<App />);
