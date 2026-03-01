import React from 'react';
import { Link } from 'react-router-dom';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import './Footer.css';

const Footer = () => (
  <footer className="footer">
    <div className="footer-inner">
      <Link to="/" className="footer-logo">
        <img src={wakeLogo} alt="Wake" className="footer-logo-img" />
      </Link>
      <div className="footer-right">
      <div className="footer-links">
        <Link to="/support" className="footer-link">Soporte</Link>
        <Link to="/legal" className="footer-link">Documentos legales</Link>
      </div>
      <div className="footer-contact">
        <a href="mailto:emilioloboguerrero@gmail.com" className="footer-contact-item">
          emilioloboguerrero@gmail.com
        </a>
        <a href="tel:+573178751956" className="footer-contact-item">
          +57 317 8751956
        </a>
      </div>
      <p className="footer-copy">© {new Date().getFullYear()} Wake</p>
      <div className="footer-fatsecret">
        <a href="https://www.fatsecret.com">Powered by fatsecret</a>
      </div>
      </div>
    </div>
  </footer>
);

export default Footer;
