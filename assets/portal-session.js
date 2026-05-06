export function renderImpersonationBanner(me) {
    if (!me?.impersonating) return;
    const banner = document.getElementById('impersonation-banner');
    if (!banner) return;
    banner.innerHTML = `
        Impersonating <strong>${escapeHtml(me.username)}</strong> as <strong>${escapeHtml(me.impersonator.username)}</strong>.
        <form method="POST" action="/admin/impersonate/stop" style="display:inline">
            <button type="submit" class="banner-btn">Return to admin</button>
        </form>
    `;
    banner.hidden = false;
    document.body.classList.add('has-impersonation-banner');
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
}
