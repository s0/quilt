import {languageFromLocale, regionFromLocale} from '@shopify/i18n';
import {isToday, isYesterday} from '@shopify/javascript-utilities/dates';
import {memoize, autobind} from '@shopify/javascript-utilities/decorators';
import {
  I18nDetails,
  PrimitiveReplacementDictionary,
  ComplexReplacementDictionary,
  TranslationDictionary,
  LanguageDirection,
} from './types';
import {
  dateStyle,
  DateStyle,
  DEFAULT_WEEK_START_DAY,
  WEEK_START_DAYS,
  RTL_LANGUAGES,
  Weekdays,
} from './constants';
import {
  MissingCurrencyCodeError,
  MissingTimezoneError,
  MissingCountryError,
} from './errors';
import {
  getCurrencySymbol,
  translate,
  TranslateOptions as RootTranslateOptions,
} from './utilities';

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  as?: 'number' | 'currency' | 'percent';
  precision?: number;
}

export interface TranslateOptions {
  scope: RootTranslateOptions<any>['scope'];
}

export default class I18n {
  readonly locale: string;
  readonly pseudolocalize: boolean | string;
  readonly defaultCountry?: string;
  readonly defaultCurrency?: string;
  readonly defaultTimezone?: string;

  get language() {
    return languageFromLocale(this.locale);
  }

  get region() {
    return regionFromLocale(this.locale);
  }

  /**
   * @deprecated Use I18n#region instead.
   */
  get countryCode() {
    return regionFromLocale(this.locale);
  }

  get languageDirection() {
    return RTL_LANGUAGES.includes(this.language)
      ? LanguageDirection.Rtl
      : LanguageDirection.Ltr;
  }

  get isRtlLanguage() {
    return this.languageDirection === LanguageDirection.Rtl;
  }

  get isLtrLanguage() {
    return this.languageDirection === LanguageDirection.Ltr;
  }

  constructor(
    public translations: TranslationDictionary[],
    {locale, currency, timezone, country, pseudolocalize = false}: I18nDetails,
  ) {
    this.locale = locale;
    this.defaultCountry = country;
    this.defaultCurrency = currency;
    this.defaultTimezone = timezone;
    this.pseudolocalize = pseudolocalize;
  }

  translate(
    id: string,
    options: TranslateOptions,
    replacements?: PrimitiveReplacementDictionary,
  ): string;
  translate(
    id: string,
    options: TranslateOptions,
    replacements?: ComplexReplacementDictionary,
  ): React.ReactElement<any>;
  translate(id: string, replacements?: PrimitiveReplacementDictionary): string;
  translate(
    id: string,
    replacements?: ComplexReplacementDictionary,
  ): React.ReactElement<any>;
  translate(
    id: string,
    optionsOrReplacements?:
      | TranslateOptions
      | PrimitiveReplacementDictionary
      | ComplexReplacementDictionary,
    replacements?:
      | PrimitiveReplacementDictionary
      | ComplexReplacementDictionary,
  ): any {
    const {pseudolocalize} = this;
    let normalizedOptions: RootTranslateOptions<
      PrimitiveReplacementDictionary | ComplexReplacementDictionary
    >;

    if (optionsOrReplacements == null) {
      normalizedOptions = {pseudotranslate: pseudolocalize};
    } else if (isTranslateOptions(optionsOrReplacements)) {
      normalizedOptions = {
        ...optionsOrReplacements,
        replacements,
        pseudotranslate: pseudolocalize,
      };
    } else {
      normalizedOptions = {
        replacements: optionsOrReplacements,
        pseudotranslate: pseudolocalize,
      };
    }

    return translate(id, normalizedOptions, this.translations, this.locale);
  }

  formatNumber(
    amount: number,
    {as, precision, ...options}: NumberFormatOptions = {},
  ) {
    const {locale, defaultCurrency: currency} = this;

    if (as === 'currency' && currency == null && options.currency == null) {
      throw new MissingCurrencyCodeError(
        `No currency code provided. formatNumber(amount, {as: 'currency'}) cannot be called without a currency code.`,
      );
    }

    return new Intl.NumberFormat(locale, {
      style: as,
      maximumFractionDigits: precision,
      currency,
      ...options,
    }).format(amount);
  }

  formatCurrency(amount: number, options: Intl.NumberFormatOptions = {}) {
    return this.formatNumber(amount, {as: 'currency', ...options});
  }

  formatPercentage(amount: number, options: Intl.NumberFormatOptions = {}) {
    return this.formatNumber(amount, {as: 'percent', ...options});
  }

  formatDate(
    date: Date,
    options?: Intl.DateTimeFormatOptions & {style?: DateStyle},
  ): string {
    const {locale, defaultTimezone: timezone} = this;

    if (timezone == null && (options == null || options.timeZone == null)) {
      throw new MissingTimezoneError(
        `No timezone code provided. formatDate() cannot be called without a timezone.`,
      );
    }

    const {style = undefined, ...formatOptions} = options || {};

    if (style) {
      if (style === DateStyle.HumanizeWithTime) {
        return this.humanizeDateWithTime(date, formatOptions);
      }
      if (style === DateStyle.Humanize) {
        return this.humanizeDate(date, formatOptions);
      }

      return this.formatDate(date, {...formatOptions, ...dateStyle[style]});
    }

    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      ...formatOptions,
    }).format(date);
  }

  weekStartDay(argCountry?: I18n['defaultCountry']): Weekdays {
    const country = argCountry || this.defaultCountry;

    if (!country) {
      throw new MissingCountryError(
        `No country code provided. weekStartDay() cannot be called without a country code.`,
      );
    }

    return WEEK_START_DAYS.get(country) || DEFAULT_WEEK_START_DAY;
  }

  @autobind
  getCurrencySymbol(currencyCode?: string) {
    const currency = currencyCode || this.defaultCurrency;
    if (currency == null) {
      throw new MissingCurrencyCodeError(
        `No currency code provided. formatCurrency cannot be called without a currency code.`,
      );
    }
    return this.getCurrencySymbolLocalized(this.locale, currency);
  }

  @memoize((currency: string, locale: string) => `${locale}${currency}`)
  getCurrencySymbolLocalized(locale: string, currency: string) {
    return getCurrencySymbol(locale, {currency});
  }

  private humanizeDate(date: Date, options?: Intl.DateTimeFormatOptions) {
    if (isToday(date)) {
      return this.translate('today');
    } else if (isYesterday(date)) {
      return this.translate('yesterday');
    } else {
      return this.formatDate(date, {
        ...options,
        ...dateStyle[DateStyle.Humanize],
      });
    }
  }

  /**
   * Intended to follow the Polaris guidelines
   *
   * @see https://polaris.shopify.com/content/grammar-and-mechanics#section-dates-numbers-and-addresses
   */
  private humanizeDateWithTime(
    date: Date,
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (isToday(date)) {
      if (isLessThanOneMinuteAgo(date)) {
        // Just now
        return this.translate('lessThanOneMinuteAgo');
      }
      if (isLessThanOneHourAgo(date)) {
        // m minutes ago
        return this.translate('lessThanOneHourAgo', {
          minutes: getDateDiff(TimeUnit.Minute, date),
        });
      }
      if (isLessThanOneDayAgo(date)) {
        // hh:mm AM
        return this.formatDate(date, {
          ...options,
          ...dateStyle[DateStyle.Time],
        });
      }
      // Today
      return this.translate('today');
    } else if (isYesterday(date)) {
      // Yesterday at hh:mm AM
      return this.translate('yesterdayAt', {
        time: this.formatDate(date, {
          ...options,
          ...dateStyle[DateStyle.Time],
        }),
      });
    } else if (isLessThanOneWeekAgo(date)) {
      // Weekday at hh:mm AM
      return this.translate('dayOfWeekAt', {
        dayOfWeek: this.formatDate(date, {
          ...options,
          weekday: 'long',
        }),
        time: this.formatDate(date, {
          ...options,
          ...dateStyle[DateStyle.Time],
        }),
      });
    } else if (isLessThanOneYearAgo(date)) {
      // MMM D at hh:mm AM
      return this.translate('monthAndDayAt', {
        date: this.formatDate(date, {
          ...options,
          month: 'short',
          day: 'numeric',
        }),
        time: this.formatDate(date, {
          ...options,
          ...dateStyle[DateStyle.Time],
        }),
      });
    } else {
      // MMM D, YYYY
      return this.formatDate(date, {
        ...options,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
}

function isTranslateOptions(
  object:
    | TranslateOptions
    | PrimitiveReplacementDictionary
    | ComplexReplacementDictionary,
): object is TranslateOptions {
  return 'scope' in object;
}

enum TimeUnit {
  Second = 1000,
  Minute = Second * 60,
  Hour = Minute * 60,
  Day = Hour * 24,
  Week = Day * 7,
  Year = Day * 365,
}

function isLessThanOneMinuteAgo(date: Date, today = new Date()) {
  return today.getTime() - date.getTime() < TimeUnit.Minute;
}

function isLessThanOneHourAgo(date: Date, today = new Date()) {
  return today.getTime() - date.getTime() < TimeUnit.Hour;
}

function isLessThanOneDayAgo(date: Date, today = new Date()) {
  return today.getTime() - date.getTime() < TimeUnit.Day;
}

function isLessThanOneWeekAgo(date: Date, today = new Date()) {
  return today.getTime() - date.getTime() < TimeUnit.Week;
}

function isLessThanOneYearAgo(date: Date, today = new Date()) {
  return today.getTime() - date.getTime() < TimeUnit.Year;
}

function getDateDiff(resolution: TimeUnit, date: Date, today = new Date()) {
  return Math.floor((today.getTime() - date.getTime()) / resolution);
}
