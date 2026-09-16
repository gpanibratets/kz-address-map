import { useEffect, useId, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { geocodeAddress, type Coordinates } from "../lib/geocode";
import { suggestAddress, type AddressSuggestion } from "../lib/suggest";
import {
  KAZAKHSTAN_BOUNDS,
  KAZAKHSTAN_CENTER,
  KAZAKHSTAN_DEFAULT_ZOOM,
  KAZAKHSTAN_FOUND_ZOOM,
} from "../lib/kazakhstan";
import { MAP_STYLE_URL } from "../lib/mapStyle";
import backArrowIcon from "../assets/icons/back-arrow.svg";
import closeIcon from "../assets/icons/close.svg";
import progressBarIcon from "../assets/icons/progress-bar.svg";
import clearFieldIcon from "../assets/icons/chevron.svg";
import separatorStrongIcon from "../assets/icons/separator-strong.svg";
import "./AddressMapScreen.css";

interface AddressForm {
  city: string;
  district: string;
  street: string;
  house: string;
  unit: string;
}

const EMPTY_FORM: AddressForm = {
  city: "",
  district: "",
  street: "",
  house: "",
  unit: "",
};

const GEOCODE_DEBOUNCE_MS = 700;
const SUGGEST_DEBOUNCE_MS = 300;

function buildQuery(form: AddressForm): string {
  return [
    [form.street, form.house].filter(Boolean).join(" "),
    form.district,
    form.city,
    "Казахстан",
  ]
    .filter(Boolean)
    .join(", ");
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

interface FieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  suggestions?: AddressSuggestion[];
  onSelectSuggestion?: (suggestion: AddressSuggestion) => void;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  suggestions,
  onSelectSuggestion,
}: FieldProps) {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);
  const [justSelected, setJustSelected] = useState(false);

  const showSuggestions =
    isFocused && !justSelected && Boolean(suggestions && suggestions.length > 0);

  return (
    <div className="field">
      <div className="field__text">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="field__input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setJustSelected(false);
            onChange(event.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoComplete="off"
          role={onSelectSuggestion ? "combobox" : undefined}
          aria-expanded={onSelectSuggestion ? showSuggestions : undefined}
          aria-autocomplete={onSelectSuggestion ? "list" : undefined}
        />
      </div>
      {value && (
        <button
          type="button"
          className="field__clear"
          aria-label={`Очистить поле «${label}»`}
          onClick={() => onChange("")}
        >
          <img src={clearFieldIcon} alt="" />
        </button>
      )}
      {showSuggestions && (
        <ul className="field__suggestions" role="listbox">
          {suggestions!.map((suggestion) => (
            <li key={suggestion.id} role="option" aria-selected="false">
              <button
                type="button"
                className="field__suggestion"
                onMouseDown={(event) => {
                  // Fires before the input's blur, so selection survives.
                  event.preventDefault();
                  onSelectSuggestion?.(suggestion);
                  setJustSelected(true);
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LightDivider() {
  return <div className="divider divider--light" />;
}

function StrongDivider() {
  return (
    <div className="divider divider--strong">
      <img src={separatorStrongIcon} alt="" />
    </div>
  );
}

export function AddressMapScreen() {
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<AddressSuggestion[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<AddressSuggestion[]>(
    [],
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);

  const setField =
    (field: keyof AddressForm) => (value: string) =>
      setForm((prev) => ({ ...prev, [field]: value }));

  // Create the map once on mount.
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: KAZAKHSTAN_CENTER,
      zoom: KAZAKHSTAN_DEFAULT_ZOOM,
      minZoom: 3,
      maxBounds: KAZAKHSTAN_BOUNDS,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  function placePin(coords: Coordinates, options: { flyTo: boolean }) {
    const map = mapRef.current;
    if (!map) return;

    const lngLat: [number, number] = [coords.lng, coords.lat];

    if (!markerRef.current) {
      const marker = new MapLibreMarker({ draggable: true }).setLngLat(
        lngLat,
      );
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        setCoordinates({ lat, lng });
      });
      marker.addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    if (options.flyTo) {
      map.flyTo({ center: lngLat, zoom: KAZAKHSTAN_FOUND_ZOOM });
    }
  }

  // Suggest-as-you-type for the city field.
  useEffect(() => {
    const query = form.city;
    if (query.trim().length < 2) {
      setCitySuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await suggestAddress(query, {
          layers: ["city", "locality", "district"],
          signal: controller.signal,
        });
        setCitySuggestions(results);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCitySuggestions([]);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.city]);

  // Suggest-as-you-type for the street field, biased towards the chosen city.
  useEffect(() => {
    const query = form.street;
    if (query.trim().length < 2) {
      setStreetSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await suggestAddress(
          form.city ? `${query}, ${form.city}` : query,
          { layers: ["street", "house"], signal: controller.signal },
        );
        setStreetSuggestions(results);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStreetSuggestions([]);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.street, form.city]);

  function handleSelectCity(suggestion: AddressSuggestion) {
    setForm((prev) => ({
      ...prev,
      city: suggestion.city ?? suggestion.label,
      district: suggestion.district ?? prev.district,
    }));
    setCitySuggestions([]);
  }

  function handleSelectStreet(suggestion: AddressSuggestion) {
    setForm((prev) => ({
      ...prev,
      street: suggestion.street ?? suggestion.label,
      city: suggestion.city ?? prev.city,
      district: suggestion.district ?? prev.district,
      house: suggestion.house ?? prev.house,
    }));
    setStreetSuggestions([]);

    if (suggestion.coordinates) {
      setCoordinates(suggestion.coordinates);
      setStatus("idle");
      setErrorMessage("");
      placePin(suggestion.coordinates, { flyTo: true });
    }
  }

  // Auto-search whenever enough of the address is filled in, instead of a
  // separate submit button (there isn't one in the design).
  useEffect(() => {
    if (!form.city || !form.street || !form.house) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      setErrorMessage("");

      try {
        const result = await geocodeAddress(buildQuery(form), controller.signal);
        if (!result) {
          setStatus("error");
          setErrorMessage(
            "Адрес не найден. Уточните написание или передвиньте пин вручную.",
          );
          return;
        }

        setCoordinates(result);
        setStatus("idle");
        placePin(result, { flyTo: true });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
        setErrorMessage("Не удалось найти адрес. Проверьте связь и попробуйте снова.");
      }
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.city, form.district, form.street, form.house]);

  return (
    <div className="screen-backdrop">
      <div className="address-card">
        <header className="address-header">
          <button type="button" className="icon-button" aria-label="Назад">
            <img src={backArrowIcon} alt="" />
          </button>
          <img
            className="address-header__progress"
            src={progressBarIcon}
            alt=""
          />
          <button type="button" className="icon-button" aria-label="Закрыть">
            <img src={closeIcon} alt="" />
          </button>
        </header>

        <div className="address-heading">
          <h1>Юридический адрес</h1>
          <p>
            Мы проверим данные вашей организации и статус регистрации в
            госорганах
          </p>
        </div>

        <h2 className="section-title">Поиск населенного пункта</h2>
        <div className="field-group">
          <Field
            label="Населенный пункт"
            value={form.city}
            placeholder="Например, г. Алматы"
            onChange={setField("city")}
            suggestions={citySuggestions}
            onSelectSuggestion={handleSelectCity}
          />
          <Field
            label="Район"
            value={form.district}
            placeholder="Например, Алмалинский р-н"
            onChange={setField("district")}
          />
        </div>

        <LightDivider />

        <h2 className="section-title">Поиск здания</h2>
        <div className="field-group">
          <Field
            label="Поиск улицы"
            value={form.street}
            placeholder="Например, ул. Абая"
            onChange={setField("street")}
            suggestions={streetSuggestions}
            onSelectSuggestion={handleSelectStreet}
          />
          <div className="field-row">
            <Field
              label="Номер дома (Строения)"
              value={form.house}
              placeholder="27"
              onChange={setField("house")}
            />
            <Field
              label="Номер помещения"
              value={form.unit}
              placeholder="б/н"
              onChange={setField("unit")}
            />
          </div>
        </div>

        <StrongDivider />

        <div className="map-section">
          <p className="map-section__hint">
            Укажите фактическое место работы кассы. Поставьте точку на карте.
          </p>

          {status === "loading" && (
            <p className="map-section__status">Ищем адрес…</p>
          )}
          {status === "error" && (
            <p className="map-section__status map-section__status--error">
              {errorMessage}
            </p>
          )}

          <div className="address-map" ref={mapContainerRef} />

          <div className="address-coordinates">
            <span className="address-coordinates__label">Координаты</span>
            <span className="address-coordinates__value">
              {coordinates
                ? `${formatCoordinate(coordinates.lat)}, ${formatCoordinate(coordinates.lng)}`
                : "Заполните адрес или поставьте точку на карте"}
            </span>
          </div>
        </div>

        <div className="bottom-bar">
          <button
            type="button"
            className="continue-button"
            disabled={!coordinates}
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
