import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminTopBar from "../AdminTopBar";
import type {
  Product,
  ProductCreate,
  ProductUpdate,
  ShapeType,
  EdgeType,
} from "../types";
import {
  getProductsPaginated,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../api";

const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangular: "Prostokątny",
  round: "Okrągły",
  oval: "Owalny",
};

const EDGE_TYPES: EdgeType[] = [
  "U3",
  "U4",
  "U5",
  "O1",
  "O3",
  "O5",
  "OGK",
  "LA",
  "S2",
  "S4",
];
const SHAPES: ShapeType[] = ["rectangular", "round", "oval"];

const PAGE_SIZE = 20;

function containsDash(value: string): boolean {
  return value.includes("-");
}

function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | string> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | string> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push("left-ellipsis");
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < totalPages - 1) pages.push("right-ellipsis");
  pages.push(totalPages);

  return pages;
}

function buildSkuPreview(
  edgeType: EdgeType | null,
  fabric: string,
  pattern: string,
  shape: ShapeType,
  width: number | null,
  height: number | null,
  diameter: number | null,
): string {
  const parts: string[] = [];
  if (edgeType) parts.push(edgeType);
  if (fabric) parts.push(fabric);
  if (pattern) parts.push(pattern);

  if (shape === "round" && diameter) {
    parts.push(`o${diameter}`);
  } else if (shape === "oval" && width && height) {
    parts.push(`${width}v${height}`);
  } else if (width && height) {
    parts.push(`${width}x${height}`);
  }

  return parts.join("-");
}

interface FormData {
  edge_type: EdgeType | null;
  fabric: string;
  pattern: string;
  shape: ShapeType;
  width: number | null;
  height: number | null;
  diameter: number | null;
}

const EMPTY_FORM: FormData = {
  edge_type: null,
  fabric: "",
  pattern: "",
  shape: "rectangular",
  width: null,
  height: null,
  diameter: null,
};

export default function AdminProducts() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Unified modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  async function loadData(page = currentPage) {
    try {
      setLoading(true);
      const data = await getProductsPaginated({
        search: search.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setProducts(data.items);
      setCurrentPage(data.page);
      setTotalProducts(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError("Nie udało się załadować produktów");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadData(1), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function openCreateModal() {
    setEditingProduct(null);
    setFormData({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormData({
      edge_type: product.edge_type,
      fabric: product.fabric,
      pattern: product.pattern,
      shape: product.shape,
      width: product.width,
      height: product.height,
      diameter: product.diameter,
    });
    setShowModal(true);
  }

  const fabricHasDash = containsDash(formData.fabric);
  const patternHasDash = containsDash(formData.pattern);
  const hasValidationErrors = fabricHasDash || patternHasDash;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || hasValidationErrors) return;

    try {
      if (editingProduct) {
        const updateData: ProductUpdate = {};
        if (formData.edge_type !== editingProduct.edge_type)
          updateData.edge_type = formData.edge_type;
        if (formData.fabric !== editingProduct.fabric)
          updateData.fabric = formData.fabric;
        if (formData.pattern !== editingProduct.pattern)
          updateData.pattern = formData.pattern;
        if (formData.shape !== editingProduct.shape)
          updateData.shape = formData.shape;
        if (formData.width !== editingProduct.width)
          updateData.width = formData.width;
        if (formData.height !== editingProduct.height)
          updateData.height = formData.height;
        if (formData.diameter !== editingProduct.diameter)
          updateData.diameter = formData.diameter;

        await updateProduct(user.id, editingProduct.id, updateData);
      } else {
        const sku = buildSkuPreview(
          formData.edge_type,
          formData.fabric,
          formData.pattern,
          formData.shape,
          formData.width,
          formData.height,
          formData.diameter,
        );
        const createData: ProductCreate = {
          sku,
          fabric: formData.fabric,
          pattern: formData.pattern,
          shape: formData.shape,
          width: formData.width,
          height: formData.height,
          diameter: formData.diameter,
          edge_type: formData.edge_type,
        };
        await createProduct(user.id, createData);
      }
      setShowModal(false);
      loadData(currentPage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się zapisać produktu",
      );
    }
  }

  async function handleDelete(product: Product) {
    if (!user) return;
    if (!confirm(`Czy na pewno chcesz usunąć produkt "${product.sku}"?`))
      return;

    try {
      await deleteProduct(user.id, product.id);
      loadData(currentPage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się usunąć produktu",
      );
    }
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  function formatDimensions(product: Product): string {
    if (product.shape === "round" && product.diameter) {
      return `⌀${product.diameter}`;
    }
    if (product.width && product.height) {
      return `${product.width}x${product.height}`;
    }
    return "-";
  }

  const pageStart = totalProducts === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = totalProducts === 0 ? 0 : pageStart + products.length - 1;
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages);

  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    loadData(page);
  }

  const skuPreview = buildSkuPreview(
    formData.edge_type,
    formData.fabric,
    formData.pattern,
    formData.shape,
    formData.width,
    formData.height,
    formData.diameter,
  );

  const isCreateMode = !editingProduct;

  return (
    <div className="app-container">
      <AdminTopBar userName={user?.name} onLogout={handleLogout} />

      <main className="main-content">
        {error && (
          <div className="error-message" onClick={() => setError(null)}>
            {error}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Produkty ({totalProducts})</h2>
            <div className="card-header-actions">
              <input
                type="text"
                placeholder="Szukaj produktu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
              <button onClick={openCreateModal} className="btn-primary">
                Dodaj produkt
              </button>
            </div>
          </div>

          {loading ? (
            <p>Ładowanie...</p>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <p>Brak produktów</p>
              <p className="text-muted">
                Produkty są automatycznie tworzone podczas synchronizacji z
                Baselinker i Invitta lub możesz je dodać ręcznie.
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Tkanina</th>
                      <th>Wzór</th>
                      <th>Wykończenie</th>
                      <th>Kształt</th>
                      <th>Wymiary</th>
                      <th>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.sku}</strong>
                        </td>
                        <td>{product.fabric}</td>
                        <td>{product.pattern}</td>
                        <td>{product.edge_type || "-"}</td>
                        <td>{SHAPE_LABELS[product.shape] || product.shape}</td>
                        <td>{formatDimensions(product)}</td>
                        <td>
                          <button
                            onClick={() => openEditModal(product)}
                            className="btn-secondary btn-sm"
                          >
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            className="btn-danger btn-sm"
                            style={{ marginLeft: "0.5rem" }}
                          >
                            Usuń
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <div className="pagination-summary">
                  Pokazano {pageStart}-{pageEnd} z {totalProducts} produktów
                </div>
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Poprzednia
                  </button>
                  {visiblePages.map((page) =>
                    typeof page === "number" ? (
                      <button
                        key={page}
                        className={`pagination-btn pagination-page-btn ${page === currentPage ? "active" : ""}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    ) : (
                      <span key={page} className="pagination-ellipsis">
                        …
                      </span>
                    ),
                  )}
                  <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Następna
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Unified modal for create & edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{isCreateMode ? "Dodaj produkt" : "Edytuj produkt"}</h2>
            <div className="sku-preview">
              <span className="sku-preview-label">SKU:</span>
              <span className="sku-preview-value">{skuPreview || "—"}</span>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Wykończenie</label>
                <select
                  value={formData.edge_type || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      edge_type: (e.target.value || null) as EdgeType | null,
                    })
                  }
                >
                  <option value="">— Brak —</option>
                  {EDGE_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Tkanina</label>
                <input
                  type="text"
                  value={formData.fabric}
                  onChange={(e) =>
                    setFormData({ ...formData, fabric: e.target.value })
                  }
                  required
                  placeholder="np. Ares"
                  className={fabricHasDash ? "input-error" : ""}
                />
                {fabricHasDash && (
                  <span className="form-error">
                    Nazwa tkaniny nie może zawierać znaku „-"
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Wzór</label>
                <input
                  type="text"
                  value={formData.pattern}
                  onChange={(e) =>
                    setFormData({ ...formData, pattern: e.target.value })
                  }
                  required
                  placeholder="np. 2000"
                  className={patternHasDash ? "input-error" : ""}
                />
                {patternHasDash && (
                  <span className="form-error">
                    Wzór nie może zawierać znaku „-"
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Kształt</label>
                <select
                  value={formData.shape}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      shape: e.target.value as ShapeType,
                      ...(e.target.value === "round"
                        ? { width: null, height: null }
                        : { diameter: null }),
                    })
                  }
                >
                  {SHAPES.map((shape) => (
                    <option key={shape} value={shape}>
                      {SHAPE_LABELS[shape]}
                    </option>
                  ))}
                </select>
              </div>

              {formData.shape === "round" ? (
                <div className="form-group">
                  <label>Średnica (cm)</label>
                  <input
                    type="number"
                    value={formData.diameter || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        diameter: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      })
                    }
                    min="1"
                    placeholder="np. 200"
                  />
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Szerokość (cm)</label>
                    <input
                      type="number"
                      value={formData.width || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          width: e.target.value
                            ? parseInt(e.target.value)
                            : null,
                        })
                      }
                      min="1"
                      placeholder="np. 140"
                    />
                  </div>
                  <div className="form-group">
                    <label>Wysokość (cm)</label>
                    <input
                      type="number"
                      value={formData.height || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          height: e.target.value
                            ? parseInt(e.target.value)
                            : null,
                        })
                      }
                      min="1"
                      placeholder="np. 200"
                    />
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={hasValidationErrors || !skuPreview}
                >
                  {isCreateMode ? "Dodaj produkt" : "Zapisz zmiany"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
