import React from 'react';
import * as LucideIcons from 'lucide-react';

export * from 'lucide-react';

const iconNameMap = {
  warehouse: 'Warehouse',
  search: 'Search',
  dark_mode: 'Moon',
  light_mode: 'Sun',
  inventory_2: 'Boxes',
  grid_view: 'LayoutGrid',
  monitoring: 'BarChart3',
  print: 'Printer',
  qr_code_scanner: 'Camera',
  sync_alt: 'ArrowRightLeft',
  category: 'Box',
  add_circle: 'Plus',
  cloud_upload: 'UploadCloud',
  package_2: 'Archive',
  history: 'FileText',
  manage_accounts: 'User',
  notifications: 'Bell',
  shelves: 'Warehouse',
  edit_note: 'FileText',
  add_box: 'Plus',
  check: 'Check',
  close: 'X',
  error: 'AlertCircle',
  warning: 'AlertTriangle',
  info: 'Info',
  flag: 'Check',
  flight_takeoff: 'ArrowUpRight',
  layers: 'Layers',
  barcode: 'Barcode',
  straighten: 'Ruler',
  person: 'User',
  settings: 'Sliders',
  desktop_windows: 'Monitor',
  smartphone: 'Smartphone',
  delete: 'Trash2',
  security: 'ShieldAlert',
  save: 'Save',
  schedule: 'Clock',
  tune: 'Sliders',
  visibility: 'Eye',
  no_photography: 'CameraOff',
  photo_camera: 'Camera',
  assignment: 'ClipboardList',
  calendar_today: 'Calendar',
  open_in_new: 'ExternalLink',
  progress_activity: 'Loader',
  login: 'LogIn',
  logout: 'LogOut',
  drag_pan: 'Move',
  qr_code_2: 'QrCode',
  radio_button_checked: 'Radio',
  refresh: 'RefreshCw',
  replay: 'RotateCcw',
  sell: 'Tag',
  trending_down: 'TrendingDown',
  trending_up: 'TrendingUp',
  volume_up: 'Volume2',
  volume_off: 'VolumeX',
  zoom_in: 'ZoomIn'
};

export const GoogleIcon = React.forwardRef(({
  name,
  size = 18,
  color,
  strokeWidth = 2,
  className = '',
  style = {},
  ...props
}, ref) => {
  const lucideName = iconNameMap[name] || (name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Info');
  const IconComponent = LucideIcons[lucideName] || LucideIcons.Info;
  return (
    <IconComponent
      ref={ref}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      {...props}
    />
  );
});

GoogleIcon.displayName = 'GoogleIcon';
