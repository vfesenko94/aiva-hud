# Заметки об оформлении README

[Главная](../README.md) · [Руководство](guide.md) · [Проверка релиза](release-checklist.md)

## Принципы

- Сначала назначение, баннер, навигация и одна команда установки.
- Описывать пользу через действия: увидеть модель, найти вклад в контекст, оценить лимиты, настроить отображение.
- Настройки подсказок показывать на примере «до → после».
- Подробности управления, хранения данных и ограничений держать в руководстве.
- Использовать короткие ссылки без декоративных стрелок. Не добавлять отдельный файл для LLM: README и guide должны читаться самостоятельно.

[Рекомендации GitHub по README](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

## Референсы

Примеры, использованные при первоначальном исследовании оформления:

| Проект | Приём |
| --- | --- |
| [Claude HUD](https://github.com/jarrodwatts/claude-hud) | Демонстрация и короткий старт. |
| [ccstatusline](https://github.com/sirmalloc/ccstatusline) | Навигация и настройки. |
| [ccusage](https://github.com/ccusage/ccusage) | Примеры по задачам. |
| [Superpowers](https://github.com/obra/superpowers) | Понятное поведение после установки. |
| [Claude-Mem](https://github.com/thedotmack/claude-mem) | Краткая главная и отдельное руководство. |

Это редакционные ориентиры, а не рейтинг или доказательство спроса.

## Точность описания

| Возможность | Где сверять |
| --- | --- |
| Видимость, форматы, подсказки и значения по умолчанию | `hooks/modules/settings/config.ts` |
| Model picker и effort | `hooks/actions.ts`, `hooks/modules/model/` |
| История и оценки контекста | `hooks/modules/context/` |
| Прогноз 5h и дневной ориентир 7d | `hooks/modules/limits/pace.ts` |
| Таймер и keep-warm | `hooks/modules/cache/` |

Не обещать точную стоимость каждого вызова, гарантированную экономию, увеличение квоты или непроверенную совместимость. Keep-warm использует дополнительные запросы и включается вручную. Баннер `images/banner.png` показывает интерфейс с демонстрационными значениями.

[Официальное описание prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

## GitHub About и темы

Описание:

> Interactive Claude Code status bar with live settings, context history, usage forecasts, and prompt-cache tracking.

Темы: `claude-code`, `claude-code-plugin`, `hud`, `statusline`, `context-window`, `token-usage`, `terminal`, `typescript`, `developer-tools`.
