import "./admin.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    // The `dark` class forces all Tailwind dark: variant classes inside the
    // admin portal to always render in dark mode, regardless of the user's
    // main app theme preference.
    return (
        <div className="dark">
            {children}
        </div>
    );
}
