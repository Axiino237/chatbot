/**
 * AI Chat Widget Loader
 * Usage: <script src="https://your-domain.com/widget.js" data-user-id="YOUR_USER_ID"></script>
 */
(function () {
    const script = document.currentScript;
    const userId = script.getAttribute('data-user-id');
    const chatUrl = script.getAttribute('data-chat-url') || 'https://chat.your-domain.com';

    const container = document.createElement('div');
    container.id = 'ai-chat-widget-container';
    Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '9999',
        fontFamily: 'sans-serif'
    });

    const button = document.createElement('button');
    button.innerHTML = '💬';
    Object.assign(button.style, {
        width: '60px',
        height: '60px',
        borderRadius: '30px',
        backgroundColor: '#6366f1',
        color: 'white',
        border: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        fontSize: '24px',
        transition: 'transform 0.3s ease'
    });

    const iframe = document.createElement('iframe');
    iframe.src = `${chatUrl}?embed=true&user_id=${userId}`;
    Object.assign(iframe.style, {
        display: 'none',
        width: '400px',
        height: '600px',
        border: 'none',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        position: 'absolute',
        bottom: '80px',
        right: '0',
        backgroundColor: 'white'
    });

    let isOpen = false;
    button.onclick = () => {
        isOpen = !isOpen;
        iframe.style.display = isOpen ? 'block' : 'none';
        button.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0)';
    };

    container.appendChild(iframe);
    container.appendChild(button);
    document.body.appendChild(container);
})();
