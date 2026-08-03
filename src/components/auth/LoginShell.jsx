export default function LoginShell({ children, className = "" }) {
  return (
    <div className={`login ${className}`.trim()}>
      <div className="login__inner card">{children}</div>
    </div>
  );
}
