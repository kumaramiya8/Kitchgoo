import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children, title }) => {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Header title={title} />
        <div className="page-body">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
