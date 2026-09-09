import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const element = document.getElementById('root');
if (element)
  ReactDOM.createRoot(element).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
