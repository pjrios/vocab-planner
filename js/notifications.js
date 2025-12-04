/**
 * Toast notification system for non-blocking user messages
 */

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                pointer-events: none;
            `;
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const colors = {
            info: { bg: 'rgba(14, 165, 233, 0.9)', border: '#0ea5e9' },
            success: { bg: 'rgba(34, 197, 94, 0.9)', border: '#22c55e' },
            error: { bg: 'rgba(239, 68, 68, 0.9)', border: '#ef4444' },
            warning: { bg: 'rgba(251, 191, 36, 0.9)', border: '#fbbf24' }
        };

        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };

        const color = colors[type] || colors.info;
        
        toast.style.cssText = `
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-radius: 8px;
            padding: 1rem 1.25rem;
            min-width: 300px;
            max-width: 400px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            color: white;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            pointer-events: auto;
            animation: slideInRight 0.3s ease-out;
            cursor: pointer;
        `;

        toast.innerHTML = `
            <span style="font-size: 1.25rem;">${icons[type] || icons.info}</span>
            <span style="flex: 1;">${message}</span>
            <button class="toast-close" style="
                background: none;
                border: none;
                color: white;
                font-size: 1.25rem;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
            ">&times;</button>
        `;

        // Add animation styles if not already added
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                @keyframes slideOutRight {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                }
                .toast-close:hover {
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        const closeToast = () => {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };

        closeBtn.addEventListener('click', closeToast);
        toast.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                closeToast();
            }
        });

        this.container.appendChild(toast);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(closeToast, duration);
        }

        return toast;
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }
}

// Export singleton instance
export const notifications = new NotificationManager();

