// Assicurati che il container principale abbia:
<div 
  ref={panelRef}
  className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 shadow-lg z-50 transition-all duration-300 flex flex-col ${collapsed ? 'w-16' : 'w-80'}`}
>
  {/* Header */}
  <div className="flex-shrink-0 p-4 border-b border-slate-200 flex items-center justify-between">
    ...
  </div>
  
  {/* Tabs - non scrollabile */}
  <nav className="flex-shrink-0 flex border-b border-slate-200">
    ...
  </nav>
  
  {/* Contenuto - scrollabile */}
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    ...
  </div>
</div>
