import React from 'react';

/**
 * GoogleIcon - Tích hợp Google Material Symbols Outlined đồng bộ 100% với Google Sans
 */
export function GoogleIcon({
  name,
  size = 18,
  color,
  strokeWidth = 2,
  fill = 0,
  className = '',
  style = {},
  ...props
}) {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;
  // Cân chỉnh độ dày nét (wght) theo strokeWidth: 1 -> 300, 2 -> 450, 3 -> 600
  const wght = strokeWidth ? Math.min(700, Math.max(100, Math.round(strokeWidth * 225))) : 400;
  const opsz = typeof size === 'number' ? Math.min(48, Math.max(20, Math.round(size))) : 24;

  return (
    <span
      className={`material-symbols-outlined google-icon ${className}`}
      style={{
        fontSize: pixelSize,
        width: pixelSize,
        height: pixelSize,
        color: color || 'currentColor',
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${wght}, 'GRAD' 0, 'opsz' ${opsz}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        verticalAlign: 'middle',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {name}
    </span>
  );
}

function createIcon(symbolName) {
  const IconComponent = React.forwardRef(
    ({ size = 18, color, strokeWidth = 2, className = '', style = {}, ...props }, ref) => (
      <GoogleIcon
        ref={ref}
        name={symbolName}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        {...props}
      />
    )
  );
  IconComponent.displayName = `GoogleIcon_${symbolName}`;
  return IconComponent;
}

// Bản đồ ánh xạ 63 icon trong hệ thống sang Google Material Symbols
export const AlertCircle = createIcon('error');
export const AlertTriangle = createIcon('warning');
export const Archive = createIcon('archive');
export const ArrowLeft = createIcon('arrow_back');
export const ArrowRight = createIcon('arrow_forward');
export const ArrowRightLeft = createIcon('sync_alt');
export const ArrowUpRight = createIcon('north_east');
export const ArrowDownRight = createIcon('south_east');
export const BarChart3 = createIcon('bar_chart');
export const Barcode = createIcon('barcode');
export const Bell = createIcon('notifications');
export const Box = createIcon('package_2');
export const Boxes = createIcon('inventory_2');
export const Calendar = createIcon('calendar_today');
export const Camera = createIcon('photo_camera');
export const CameraOff = createIcon('no_photography');
export const Check = createIcon('check');
export const CheckCircle2 = createIcon('check_circle');
export const CheckSquare = createIcon('check_box');
export const ChevronDown = createIcon('expand_more');
export const ChevronRight = createIcon('chevron_right');
export const ChevronUp = createIcon('expand_less');
export const ClipboardList = createIcon('assignment');
export const Clock = createIcon('schedule');
export const Database = createIcon('database');
export const Download = createIcon('download');
export const ExternalLink = createIcon('open_in_new');
export const Eye = createIcon('visibility');
export const Factory = createIcon('factory');
export const FileText = createIcon('description');
export const Info = createIcon('info');
export const Layers = createIcon('layers');
export const LayoutGrid = createIcon('grid_view');
export const Loader = createIcon('progress_activity');
export const LogIn = createIcon('login');
export const LogOut = createIcon('logout');
export const Monitor = createIcon('desktop_windows');
export const Moon = createIcon('dark_mode');
export const Move = createIcon('drag_pan');
export const Package = createIcon('package_2');
export const PackageMinus = createIcon('package_2');
export const Plus = createIcon('add');
export const Printer = createIcon('print');
export const QrCode = createIcon('qr_code_2');
export const Radio = createIcon('radio_button_checked');
export const RefreshCw = createIcon('refresh');
export const RotateCcw = createIcon('replay');
export const Ruler = createIcon('straighten');
export const Save = createIcon('save');
export const Search = createIcon('search');
export const ShieldAlert = createIcon('security');
export const Sliders = createIcon('tune');
export const Smartphone = createIcon('smartphone');
export const Sun = createIcon('light_mode');
export const Tag = createIcon('sell');
export const Tags = createIcon('sell');
export const Trash2 = createIcon('delete');
export const TrendingDown = createIcon('trending_down');
export const TrendingUp = createIcon('trending_up');
export const UploadCloud = createIcon('cloud_upload');
export const User = createIcon('person');
export const Volume2 = createIcon('volume_up');
export const VolumeX = createIcon('volume_off');
export const Warehouse = createIcon('warehouse');
export const X = createIcon('close');
export const ZoomIn = createIcon('zoom_in');

