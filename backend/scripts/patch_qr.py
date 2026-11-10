"""
Patch App.jsx to add:
1. scanResultModal + scanQty states
2. makeStickerQrUrl helper
3. useEffect to detect ?scan= URL param
4. QR section in printTommyStickersForGroup sticker HTML + CSS
5. QR section in printAllReadyLabels sticker HTML + CSS
6. Scan Result Modal JSX
"""

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File loaded: {len(content)} chars")

changes_made = []

# ─────────────────────────────────────────────────────────────────────
# 1. Add scanResultModal + scanQty states after highlightedSampleId
# ─────────────────────────────────────────────────────────────────────
OLD1 = "  const [highlightedSampleId, setHighlightedSampleId] = useState(null);\n  const [searchResultSlots, setSearchResultSlots] = useState([]);"
NEW1 = """  const [highlightedSampleId, setHighlightedSampleId] = useState(null);
  const [searchResultSlots, setSearchResultSlots] = useState([]);
  // QR Scan modal (when user opens app via QR code on label)
  const [scanResultModal, setScanResultModal] = useState(null); // sample object | { notFound, sku }
  const [scanQty, setScanQty] = useState('');"""

if OLD1 in content:
    content = content.replace(OLD1, NEW1, 1)
    changes_made.append("1. Added scanResultModal + scanQty states")
else:
    print("WARN: change 1 not found")

# ─────────────────────────────────────────────────────────────────────
# 2. Add makeStickerQrUrl helper + useEffect for ?scan= detection
#    Insert after the last useEffect block found (line ~2859)
#    We'll insert before "const handleTakeRequest"
# ─────────────────────────────────────────────────────────────────────
OLD2 = "  const handleTakeRequest = async (sample, qty, note) => {"
NEW2 = """  // ── QR Sticker URL helper ──────────────────────────────────────────
  const makeStickerQrUrl = (sku) => {
    const base = window.location.origin + window.location.pathname.replace(/\\/$/, '');
    return `${base}?scan=${encodeURIComponent(sku)}`;
  };

  // Detect ?scan=<sku> when app loads (from QR code on printed label)
  // This runs once on mount; guests can use it without login
  // eslint-disable-next-line react-hooks/exhaustive-deps
  /* scan-on-mount handled in dedicated useEffect below */

  const handleTakeRequest = async (sample, qty, note) => {"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2, 1)
    changes_made.append("2. Added makeStickerQrUrl helper")
else:
    print("WARN: change 2 not found")

# ─────────────────────────────────────────────────────────────────────
# 3. Add useEffect for ?scan= after the last existing useEffect
#    Insert before "  const handleTakeRequest" (after helper we just added)
# ─────────────────────────────────────────────────────────────────────
OLD3 = "  /* scan-on-mount handled in dedicated useEffect below */\n\n  const handleTakeRequest = async (sample, qty, note) => {"
NEW3 = """  /* scan-on-mount handled in dedicated useEffect below */

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanSku = params.get('scan');
    if (!scanSku) return;
    // Remove ?scan= from URL without reload
    window.history.replaceState({}, '', window.location.pathname);
    // Query Supabase for this sample
    supabase
      .from('samples')
      .select('*, products(*)')
      .eq('sku', scanSku)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setScanResultModal({ notFound: true, sku: scanSku });
        } else {
          setScanResultModal(data);
        }
      });
  }, []);

  const handleTakeRequest = async (sample, qty, note) => {"""

if OLD3 in content:
    content = content.replace(OLD3, NEW3, 1)
    changes_made.append("3. Added useEffect scan-on-mount")
else:
    print("WARN: change 3 not found")

# ─────────────────────────────────────────────────────────────────────
# Helper: sticker body HTML with QR (shared template)
# ─────────────────────────────────────────────────────────────────────
def make_sticker_html(with_tray_badge=True):
    tray_line = "${trayBadge}" if with_tray_badge else ""
    return f"""          <div class="sticker">
            {tray_line}
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${{s.products?.product_name || s.product_name}}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${{s.products?.warning_code || 'Không cảnh báo'}}</span>
              </div>
              ${{s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${{s.order_number}}</span>
              </div>` : ''}}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${{formatBlendBatch(s.blend_batch)}}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${{boxSeqStr}}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${{new Date(s.blend_date).toLocaleDateString()}}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${{new Date(s.packaging_date).toLocaleDateString()}}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${{new Date(s.sampling_time).toLocaleString()}}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${{locText.toUpperCase()}}</span>
              </div>
            </div>
            <div class="qr-section">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=84x84&margin=2&data=${{encodeURIComponent(makeStickerQrUrl(s.sku))}}" width="84" height="84" alt="${{s.sku}}" style="display:block;" />
              <div class="qr-sku">${{s.sku}}</div>
            </div>
          </div>"""

# ─────────────────────────────────────────────────────────────────────
# Helper: CSS additions for QR section
# ─────────────────────────────────────────────────────────────────────
QR_CSS = """          .qr-section {
            width: 22mm;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-left: 2px;
          }
          .qr-sku {
            font-size: 5px;
            color: #555;
            text-align: center;
            margin-top: 2px;
            word-break: break-all;
            line-height: 1.1;
            max-width: 22mm;
          }"""

# ─────────────────────────────────────────────────────────────────────
# 4. Update printTommyStickersForGroup sticker HTML
# ─────────────────────────────────────────────────────────────────────
OLD4 = """          <div class="sticker">
            ${trayBadge}
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
              </div>
              ${s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${s.order_number}</span>
              </div>` : ''}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${boxSeqStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
              </div>
            </div>
          </div>
        `);
      }
    });


    // 2. Chunk into pages of 21"""

NEW4 = """          <div class="sticker">
            ${trayBadge}
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
              </div>
              ${s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${s.order_number}</span>
              </div>` : ''}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${boxSeqStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
              </div>
            </div>
            <div class="qr-section">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=84x84&margin=2&data=${encodeURIComponent(makeStickerQrUrl(s.sku))}" width="84" height="84" alt="${s.sku}" style="display:block;" />
              <div class="qr-sku">${s.sku}</div>
            </div>
          </div>
        `);
      }
    });


    // 2. Chunk into pages of 21"""

if OLD4 in content:
    content = content.replace(OLD4, NEW4, 1)
    changes_made.append("4. Updated printTommyStickersForGroup sticker HTML with QR")
else:
    print("WARN: change 4 (sticker HTML in printTommyStickersForGroup) not found")
    # debug
    key = 'Nhãn Mẫu Thuốc Lá</div>'
    idx = content.find(key)
    print(f"  Key found at: {idx}, context: {repr(content[idx:idx+50])}")

# ─────────────────────────────────────────────────────────────────────
# 5. Add QR CSS to printTommyStickersForGroup CSS block
# ─────────────────────────────────────────────────────────────────────
OLD5 = """          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
  };

  const printAllReadyLabels"""

NEW5 = """          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .qr-section {
            width: 22mm;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-left: 2px;
          }
          .qr-sku {
            font-size: 5px;
            color: #555;
            text-align: center;
            margin-top: 2px;
            word-break: break-all;
            line-height: 1.1;
            max-width: 22mm;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
  };

  const printAllReadyLabels"""

if OLD5 in content:
    content = content.replace(OLD5, NEW5, 1)
    changes_made.append("5. Added QR CSS to printTommyStickersForGroup")
else:
    print("WARN: change 5 not found")

# ─────────────────────────────────────────────────────────────────────
# 6. Update printAllReadyLabels sticker HTML
# ─────────────────────────────────────────────────────────────────────
OLD6 = """          <div class="sticker">
            ${trayBadge}
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
              </div>
              ${s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${s.order_number}</span>
              </div>` : ''}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${boxSeqStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
              </div>
            </div>
          </div>
        `);
      }
    });

    // Chunk all stickers into pages of 21 continuously"""

NEW6 = """          <div class="sticker">
            ${trayBadge}
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
              </div>
              ${s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${s.order_number}</span>
              </div>` : ''}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${boxSeqStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
              </div>
            </div>
            <div class="qr-section">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=84x84&margin=2&data=${encodeURIComponent(makeStickerQrUrl(s.sku))}" width="84" height="84" alt="${s.sku}" style="display:block;" />
              <div class="qr-sku">${s.sku}</div>
            </div>
          </div>
        `);
      }
    });

    // Chunk all stickers into pages of 21 continuously"""

if OLD6 in content:
    content = content.replace(OLD6, NEW6, 1)
    changes_made.append("6. Updated printAllReadyLabels sticker HTML with QR")
else:
    print("WARN: change 6 (printAllReadyLabels sticker HTML) not found")

# ─────────────────────────────────────────────────────────────────────
# 7. Add QR CSS to printAllReadyLabels CSS block
#    Find the second occurrence of the info-val + closing style pattern
# ─────────────────────────────────────────────────────────────────────
OLD7 = """          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };"""

NEW7 = """          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .qr-section {
            width: 22mm;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-left: 2px;
          }
          .qr-sku {
            font-size: 5px;
            color: #555;
            text-align: center;
            margin-top: 2px;
            word-break: break-all;
            line-height: 1.1;
            max-width: 22mm;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };"""

if OLD7 in content:
    content = content.replace(OLD7, NEW7, 1)
    changes_made.append("7. Added QR CSS to printAllReadyLabels")
else:
    print("WARN: change 7 not found")

# ─────────────────────────────────────────────────────────────────────
# 8. Add Scan Result Modal JSX before closing </div> of the app
# ─────────────────────────────────────────────────────────────────────
OLD8 = "\n    </div>\n  );\n}\n"
NEW8 = """
      {/* ── QR SCAN RESULT MODAL (auto-opens when app loaded via ?scan=) ── */}
      {scanResultModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => { setScanResultModal(null); setScanQty(''); }}>
          <div className="modal-content" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📦 Thông tin mẫu
              </h3>
              <button className="close-btn" onClick={() => { setScanResultModal(null); setScanQty(''); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {scanResultModal.notFound ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--status-error)', marginBottom: '6px' }}>Không tìm thấy mẫu</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Mã: <strong>{scanResultModal.sku}</strong></div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {scanResultModal.products?.product_name || scanResultModal.product_name}
                        {scanResultModal.products?.warning_code && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                            {scanResultModal.products.warning_code}
                          </span>
                        )}
                      </div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Mẻ sợi:</span> <strong>{formatBlendBatch(scanResultModal.blend_batch)}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Ngày SX bao:</span> <strong>{new Date(scanResultModal.packaging_date).toLocaleDateString()}</strong></div>
                      {scanResultModal.shelf && (
                        <div style={{ marginTop: '4px', padding: '6px 10px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: '6px', fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '14px' }}>
                          📍 {formatLocation(scanResultModal.shelf, scanResultModal.slot, scanResultModal.column_number)}
                        </div>
                      )}
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Còn lại:</span>{' '}
                        {scanResultModal.available_qty > 0
                          ? <strong style={{ color: 'var(--status-success)' }}>{scanResultModal.available_qty} bao</strong>
                          : <strong style={{ color: 'var(--status-error)' }}>Đã hết</strong>
                        }
                      </div>
                    </div>
                  </div>

                  {scanResultModal.available_qty > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Số bao cần lấy:</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          min="1"
                          max={scanResultModal.available_qty}
                          placeholder={`Tối đa ${scanResultModal.available_qty} bao`}
                          value={scanQty}
                          onChange={e => setScanQty(e.target.value)}
                          className="form-input"
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <button
                          className="btn btn-primary"
                          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', whiteSpace: 'nowrap', padding: '0 16px' }}
                          disabled={!scanQty || parseInt(scanQty) <= 0 || parseInt(scanQty) > scanResultModal.available_qty || loading}
                          onClick={() => {
                            handleTakeRequest(scanResultModal, parseInt(scanQty), 'Lấy mẫu qua QR tem');
                            setScanResultModal(null);
                            setScanQty('');
                          }}
                        >
                          <LogOut size={15} /> Lấy mẫu
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Yêu cầu sẽ được gửi đến thủ kho để xác nhận.
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--status-error)', fontWeight: 'bold', fontSize: '14px', padding: '8px 0' }}>
                      ⚠️ Mẫu này đã hết, không thể lấy.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setScanResultModal(null); setScanQty(''); }}>Đóng</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
"""

if OLD8 in content:
    content = content.replace(OLD8, NEW8, 1)
    changes_made.append("8. Added Scan Result Modal JSX")
else:
    print("WARN: change 8 (scan modal) not found — checking end of file")
    print(repr(content[-200:]))

# ─────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────
with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n=== Changes applied ({len(changes_made)}/8) ===")
for c in changes_made:
    print(f"  ✓ {c}")
