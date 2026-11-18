import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  User,
  Mail,
  Shield,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Loader
} from '../GoogleIcons';
import {
  validatePasswordStrength,
  changeMyPassword,
  updateMyEmail,
  completePasswordRecovery
} from '../services/authService';

export default function AccountModal({
  isOpen,
  onClose,
  user,
  profile,
  isRecoveryMode = false,
  onRecoveryComplete,
  isDemoMode = false,
  showToast,
  onEmailUpdated
}) {
  const [activeTab, setActiveTab] = useState('password'); // 'password' | 'info'

  // Password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Email state
  const [newEmail, setNewEmail] = useState('');

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowOldPwd(false);
      setShowNewPwd(false);
      setShowConfirmPwd(false);
      setNewEmail(user?.email || profile?.email || '');
      setErrorMsg('');
      setSuccessMsg('');
      setActiveTab('password');
    }
  }, [isOpen, isRecoveryMode, user?.email, profile?.email]);

  if (!isOpen) return null;
  if (!isRecoveryMode && (!user || !profile)) return null;

  const strength = validatePasswordStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!strength.valid) {
      setErrorMsg(strength.message);
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (isDemoMode) {
      const msg = isRecoveryMode
        ? 'Đã đặt lại mật khẩu mới (Chế độ Demo).'
        : 'Đã cập nhật mật khẩu mới (Chế độ Demo).';
      setSuccessMsg(msg);
      if (showToast) showToast(msg, 'success');
      if (isRecoveryMode && onRecoveryComplete) onRecoveryComplete();
      return;
    }

    try {
      setSubmitting(true);
      if (isRecoveryMode) {
        await completePasswordRecovery(newPassword);
        const msg = 'Đặt lại mật khẩu mới thành công!';
        setSuccessMsg(msg);
        if (showToast) showToast(msg, 'success');
        setNewPassword('');
        setConfirmPassword('');
        if (onRecoveryComplete) onRecoveryComplete();
      } else {
        await changeMyPassword(user?.email || profile?.email, oldPassword, newPassword);
        const msg = 'Đổi mật khẩu thành công!';
        setSuccessMsg(msg);
        if (showToast) showToast(msg, 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Không thể cập nhật mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmed = newEmail.trim();
    const currentEmail = user?.email || profile?.email || '';
    if (!trimmed) {
      setErrorMsg('Vui lòng nhập email mới.');
      return;
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setErrorMsg('Email mới trùng với email hiện tại.');
      return;
    }

    if (isDemoMode) {
      const msg = 'Đã cập nhật email đăng nhập (Chế độ Demo).';
      setSuccessMsg(msg);
      if (showToast) showToast(msg, 'success');
      return;
    }

    try {
      setSubmitting(true);
      await updateMyEmail(trimmed);
      const msg = 'Đã gửi yêu cầu đổi email! Vui lòng kiểm tra hộp thư để xác nhận email mới.';
      setSuccessMsg(msg);
      if (showToast) showToast(msg, 'success');
      if (onEmailUpdated) onEmailUpdated(trimmed);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể cập nhật email.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputWithEyeStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  };

  const eyeBtnStyle = {
    position: 'absolute',
    right: '10px',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const renderStrengthChecklist = () => {
    const items = [
      { ok: strength.checks.minLength, label: 'Ít nhất 8 ký tự' },
      { ok: strength.checks.hasLetter, label: 'Có ít nhất 1 chữ cái' },
      { ok: strength.checks.hasNumber, label: 'Có ít nhất 1 chữ số' }
    ];
    return (
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 14px',
        marginTop: '8px',
        padding: '8px 10px',
        borderRadius: '8px',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-color)'
      }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: item.ok ? 600 : 400,
              color: item.ok ? 'var(--status-success)' : 'var(--text-muted)'
            }}
          >
            <Check size={13} strokeWidth={2.5} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--card-shadow)',
          background: 'var(--bg-card)',
          color: 'var(--text-main)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '18px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(15, 135, 255, 0.14)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {isRecoveryMode ? <Key size={19} /> : <Shield size={19} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>
                {isRecoveryMode ? 'Đặt lại mật khẩu mới' : 'Tài khoản & Bảo mật'}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {isRecoveryMode
                  ? 'Nhập mật khẩu mới cho tài khoản của bạn'
                  : (user?.email || profile?.email || profile?.full_name)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs (chỉ hiển thị khi không ở chế độ recovery) */}
        {!isRecoveryMode && (
          <div style={{
            display: 'flex',
            background: 'var(--bg-subtle)',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '18px',
            gap: '4px',
            border: '1px solid var(--border-color)'
          }}>
            <button
              type="button"
              onClick={() => { setActiveTab('password'); setErrorMsg(''); setSuccessMsg(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: activeTab === 'password' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'password' ? '#ffffff' : 'var(--text-muted)',
                transition: 'var(--transition-fast)'
              }}
            >
              <Key size={14} />
              <span>Đổi mật khẩu</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('info'); setErrorMsg(''); setSuccessMsg(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: activeTab === 'info' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'info' ? '#ffffff' : 'var(--text-muted)',
                transition: 'var(--transition-fast)'
              }}
            >
              <User size={14} />
              <span>Thông tin & Email</span>
            </button>
          </div>
        )}

        {/* Alert banners */}
        {errorMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: 'var(--status-error)',
            fontSize: '13px',
            marginBottom: '14px'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: 'var(--status-success)',
            fontSize: '13px',
            marginBottom: '14px'
          }}>
            <Check size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1 or Recovery Mode: Password form */}
        {(isRecoveryMode || activeTab === 'password') ? (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!isRecoveryMode && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12.5px' }}>Mật khẩu hiện tại</label>
                <div style={inputWithEyeStyle}>
                  <input
                    className="form-input"
                    type={showOldPwd ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    style={{ paddingRight: '38px' }}
                  />
                  <button
                    type="button"
                    style={eyeBtnStyle}
                    onClick={() => setShowOldPwd((v) => !v)}
                    aria-label={showOldPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showOldPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12.5px' }}>Mật khẩu mới</label>
              <div style={inputWithEyeStyle}>
                <input
                  className="form-input"
                  type={showNewPwd ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự, gồm chữ và số"
                  style={{ paddingRight: '38px' }}
                />
                <button
                  type="button"
                  style={eyeBtnStyle}
                  onClick={() => setShowNewPwd((v) => !v)}
                  aria-label={showNewPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {renderStrengthChecklist()}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12.5px' }}>Xác nhận mật khẩu mới</label>
              <div style={inputWithEyeStyle}>
                <input
                  className="form-input"
                  type={showConfirmPwd ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  style={{ paddingRight: '38px' }}
                />
                <button
                  type="button"
                  style={eyeBtnStyle}
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  aria-label={showConfirmPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div style={{ fontSize: '12px', color: 'var(--status-error)', marginTop: '6px' }}>
                  Mật khẩu xác nhận chưa trùng khớp.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Đóng
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader size={15} className="spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <span>{isRecoveryMode ? 'Xác nhận mật khẩu mới' : 'Lưu mật khẩu mới'}</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Tab 2: Readonly Profile Info + Email Change */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Họ và tên</div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                  {profile?.full_name || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Mã nhân viên</div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                  {profile?.employee_code || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Phòng ban</div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                  {profile?.department || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Vai trò</div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: profile?.role === 'admin' ? 'var(--primary)' : 'var(--text-main)' }}>
                  {profile?.role === 'admin' ? 'Thủ kho (Admin)' : 'Nhân viên (Staff)'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-6px' }}>
              Thông tin nhân sự và phân quyền do Thủ kho (Admin) quản lý và cập nhật.
            </div>

            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={14} />
                  <span>Email đăng nhập</span>
                </label>
                <input
                  className="form-input"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@congty.com"
                />
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  Sau khi lưu, hệ thống sẽ gửi thư xác nhận đến địa chỉ email mới.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                  Đóng
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader size={15} className="spin" />
                      <span>Đang cập nhật...</span>
                    </>
                  ) : (
                    <span>Cập nhật Email</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
