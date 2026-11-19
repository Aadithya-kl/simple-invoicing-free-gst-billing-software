import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ChevronDown, LayoutGrid, SlidersHorizontal, Store, Table as TableIcon } from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/EmptyState';
import StatusToasts from '../../components/StatusToasts';
import { fetchCatalog, placeOrder } from '../../features/marketplace/api';
import { marketplaceQueryKeys } from '../../features/marketplace/queryKeys';
import { useMarketplaceConnection } from '../../features/marketplace/useMarketplaceSync';
import { formatMoney, formatQuantity } from '../../features/marketplace/decimal';
import type { CatalogFilters, CatalogListing, CatalogSort } from '../../features/marketplace/types';
import { fetchCompanyProfile } from '../../features/invoices/api';
import { invoiceQueryKeys } from '../../features/invoices/queryKeys';
import { countActiveFilters, useMarketplaceBrowseStore } from '../../store/useMarketplaceBrowseStore';
import BuyNowModal from './components/BuyNowModal';
import SyncStatusChip from './components/SyncStatusChip';
import UnverifiedSellerBadge from './components/UnverifiedSellerBadge';
import { formatRelativeTime } from './components/format';

const PAGE_SIZE = 24;

/** The seller's quantity is a republished snapshot, never a live reading, so it
 *  is only ever rendered together with its age. */
function availabilityLabel(listing: CatalogListing): string {
  const quantity = formatQuantity(listing.available_quantity);
  if (quantity === '—') return 'Seller has not published a quantity';
  const asOf = listing.available_quantity_as_of
    ? ` (as of ${formatRelativeTime(listing.available_quantity_as_of)})`
    : '';
  return `Seller reports ${quantity} ${listing.unit}${asOf}`;
}

/** What a company that cannot trade is told above the catalogue. */
function guestNotice(status: string, isAdmin: boolean): string {
  if (status === 'pending_approval') {
    return 'Your marketplace registration is awaiting operator approval. You can browse now; buying and selling open as soon as it is approved.';
  }
  if (status === 'suspended' || status === 'unauthorized') {
    return 'This company cannot trade on the marketplace right now. You can still browse. Marketplace settings has the details.';
  }
  return isAdmin
    ? 'You are browsing as a guest. Register this company to buy and sell.'
    : 'You are browsing as a guest. Ask an admin to register this company to buy and sell.';
}

export default function MarketplaceBrowsePage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const connectionQuery = useMarketplaceConnection();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buyTarget, setBuyTarget] = useState<CatalogListing | null>(null);
  const [buyError, setBuyError] = useState('');
  const [success, setSuccess] = useState('');
  const [listError, setListError] = useState('');

  const {
    viewType,
    cursor,
    cursorStack,
    setViewType,
    setQuery,
    setHsnSac,
    setMinPrice,
    setMaxPrice,
    setSellerStateCode,
    setInStock,
    setSort,
    goToNextPage,
    goToPreviousPage,
    resetFilters,
    ...rest
  } = useMarketplaceBrowseStore();

  const filters: CatalogFilters = {
    q: rest.q,
    hsn_sac: rest.hsn_sac,
    min_price: rest.min_price,
    max_price: rest.max_price,
    seller_state_code: rest.seller_state_code,
    in_stock: rest.in_stock,
    sort: rest.sort,
  };

  // A failed probe means no connection row, the same as never having registered.
  const status = connectionQuery.error ? 'unregistered' : connectionQuery.data?.status ?? 'unregistered';
  const connected = status === 'connected';

  // Everyone browses: a company that has not registered sees the default
  // marketplace read-only. Only buying needs a connected registration.
  const catalogQuery = useQuery({
    queryKey: marketplaceQueryKeys.catalog(filters, cursor, PAGE_SIZE),
    queryFn: () => fetchCatalog(filters, cursor, PAGE_SIZE),
    placeholderData: keepPreviousData,
    enabled: !connectionQuery.isLoading,
  });
  // 404: no connection and no default marketplace on this deployment.
  // 403: the marketplace does not show listings before registering.
  const catalogStatus = isAxiosError(catalogQuery.error) ? catalogQuery.error.response?.status : undefined;
  const noMarketplace = catalogStatus === 404;
  const browseRefused = catalogStatus === 403;

  const companyQuery = useQuery({
    queryKey: invoiceQueryKeys.company,
    queryFn: fetchCompanyProfile,
  });

  const buyMutation = useMutation({
    mutationFn: (input: { listingId: string; quantity: string }) =>
      placeOrder({ listing_id: input.listingId, quantity: input.quantity }),
    onSuccess: () => {
      setBuyTarget(null);
      setBuyError('');
      setSuccess('Order placed. It stays pending until the seller accepts — track it under Orders.');
      void queryClient.invalidateQueries({ queryKey: marketplaceQueryKeys.all });
    },
    onError: (err) => setBuyError(getApiErrorMessage(err, 'Unable to place this order')),
  });

  // Browse failures are ordinary (the marketplace may be down); they surface as
  // a toast rather than replacing the page.
  useEffect(() => {
    if (catalogQuery.error && !noMarketplace && !browseRefused) setListError(getApiErrorMessage(catalogQuery.error, 'Unable to load listings'));
  }, [catalogQuery.error, noMarketplace, browseRefused]);

  const activeFilterCount = countActiveFilters(filters);
  const listings = catalogQuery.data?.items ?? [];
  const ourGstin = connectionQuery.data?.gstin ?? companyQuery.data?.gst ?? null;

  // Unregistered companies see the listing but cannot order it.
  const buyAction = (listing: CatalogListing) =>
    connected ? (
      <button
        type="button"
        className="button button--primary button--small"
        onClick={() => { setBuyError(''); setBuyTarget(listing); }}
      >
        Buy now
      </button>
    ) : (
      <span className="marketplace-note">Registered companies only</span>
    );

  return (
    <div className="marketplace-page stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Marketplace</p>
          <h1 className="page-title">Browse listings</h1>
          <p className="section-copy">
            Surplus stock published by other businesses running this app. Prices are per unit and
            tax-exclusive.
          </p>
        </div>
        {connectionQuery.data && <SyncStatusChip connection={connectionQuery.data} />}
      </section>

      {connectionQuery.isLoading ? (
        <EmptyState message="Checking marketplace connection…" />
      ) : noMarketplace || browseRefused ? (
        <div className="panel stack">
          <EmptyState
            message={
              browseRefused
                ? 'This marketplace only shows listings to registered companies. Register this company to browse, buy and sell.'
                : 'This company is not connected to a marketplace. Connect one to browse listings from other businesses, publish your own surplus stock, and trade.'
            }
            action={
              isAdmin ? (
                <Link to="/settings/marketplace" className="button button--primary">
                  <Store size={16} />
                  {browseRefused ? 'Open marketplace settings' : 'Connect to a marketplace'}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {!connected && (
            <section className="panel marketplace-guest-notice" role="status">
              <p className="section-copy">{guestNotice(status, isAdmin)}</p>
              {isAdmin && (
                <Link to="/settings/marketplace" className="button button--primary button--small">
                  <Store size={16} />
                  {status === 'unregistered' || status === 'disconnected'
                    ? 'Register to buy and sell'
                    : 'Open marketplace settings'}
                </Link>
              )}
            </section>
          )}
          <section className="panel stack">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Catalogue</p>
                <h2 className="nav-panel__title">
                  {catalogQuery.data?.total_estimate != null
                    ? `About ${catalogQuery.data.total_estimate} listings`
                    : 'Listings'}
                </h2>
              </div>

              <div className="marketplace-view-tabs" role="tablist" aria-label="Listing view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewType === 'card'}
                  className={`button button--small ${viewType === 'card' ? 'button--primary' : 'button--ghost'}`}
                  onClick={() => setViewType('card')}
                >
                  <LayoutGrid size={16} />
                  Card
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewType === 'table'}
                  className={`button button--small ${viewType === 'table' ? 'button--primary' : 'button--ghost'}`}
                  onClick={() => setViewType('table')}
                >
                  <TableIcon size={16} />
                  Table
                </button>
              </div>
            </div>

            <div className="marketplace-toolbar">
              <input
                className="input marketplace-toolbar__search"
                type="search"
                aria-label="Search marketplace listings"
                placeholder="Search titles and descriptions…"
                value={filters.q}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="marketplace-toolbar__actions">
                <button
                  type="button"
                  className={`button button--small ${filtersOpen || activeFilterCount > 0 ? 'button--primary' : 'button--ghost'}`}
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="marketplace-filter-badge">{activeFilterCount}</span>
                  )}
                  <ChevronDown
                    size={16}
                    className="marketplace-chevron"
                    style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </button>
                <button type="button" className="button button--ghost button--small" onClick={resetFilters}>
                  Reset
                </button>
              </div>
            </div>

            {filtersOpen && (
              <div className="marketplace-drawer">
                <div className="marketplace-drawer__fields">
                  <label className="marketplace-field">
                    <span className="marketplace-field__label">HSN / SAC</span>
                    <input
                      className="input"
                      type="text"
                      value={filters.hsn_sac}
                      onChange={(event) => setHsnSac(event.target.value)}
                      placeholder="e.g. 8482"
                    />
                  </label>
                  <label className="marketplace-field">
                    <span className="marketplace-field__label">Min price</span>
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      value={filters.min_price}
                      onChange={(event) => setMinPrice(event.target.value)}
                    />
                  </label>
                  <label className="marketplace-field">
                    <span className="marketplace-field__label">Max price</span>
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      value={filters.max_price}
                      onChange={(event) => setMaxPrice(event.target.value)}
                    />
                  </label>
                  <label className="marketplace-field">
                    <span className="marketplace-field__label">Seller state code</span>
                    <input
                      className="input"
                      type="text"
                      maxLength={2}
                      value={filters.seller_state_code}
                      onChange={(event) => setSellerStateCode(event.target.value)}
                      placeholder="e.g. 27"
                    />
                  </label>
                  <label className="marketplace-field">
                    <span className="marketplace-field__label">Sort</span>
                    <select
                      className="input"
                      value={filters.sort}
                      onChange={(event) => setSort(event.target.value as CatalogSort)}
                    >
                      <option value="newest">Newest</option>
                      <option value="price_asc">Price: low to high</option>
                      <option value="price_desc">Price: high to low</option>
                    </select>
                  </label>
                </div>
                <label className="marketplace-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.in_stock}
                    onChange={(event) => setInStock(event.target.checked)}
                  />
                  <span>Only listings the seller reports as in stock</span>
                </label>
              </div>
            )}
          </section>

          <section className="panel marketplace-results">
            {catalogQuery.isLoading && <EmptyState message="Loading listings…" />}
            {!catalogQuery.isLoading && listings.length === 0 && (
              <EmptyState message="No listings match these filters." />
            )}

            {!catalogQuery.isLoading && listings.length > 0 && viewType === 'card' && (
              <div className="marketplace-card-grid">
                {listings.map((listing) => (
                  <article key={listing.listing_id} className="marketplace-card">
                    <header className="marketplace-card__header">
                      <h3 className="marketplace-card__title">{listing.title}</h3>
                      <span className="marketplace-card__price">
                        {formatMoney(listing.asking_price, listing.currency_code)}
                        <small> / {listing.unit}</small>
                      </span>
                    </header>

                    {listing.description && (
                      <p className="marketplace-card__description">{listing.description}</p>
                    )}

                    <div className="marketplace-card__seller">
                      <span>{listing.seller.legal_name}</span>
                      <UnverifiedSellerBadge />
                    </div>

                    <dl className="marketplace-card__meta">
                      <div>
                        <dt>GST</dt>
                        <dd>{listing.gst_rate}%</dd>
                      </div>
                      <div>
                        <dt>HSN/SAC</dt>
                        <dd>{listing.hsn_sac || '—'}</dd>
                      </div>
                      <div>
                        <dt>State</dt>
                        <dd>{listing.seller.state_code || '—'}</dd>
                      </div>
                    </dl>

                    <p className="marketplace-note">{availabilityLabel(listing)}</p>

                    <div className="button-row">
                      {buyAction(listing)}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!catalogQuery.isLoading && listings.length > 0 && viewType === 'table' && (
              <div className="marketplace-table-scroll">
                <table className="marketplace-table">
                  <caption className="sr-only">Marketplace listings</caption>
                  <thead>
                    <tr>
                      <th scope="col">Listing</th>
                      <th scope="col">Seller</th>
                      <th scope="col">Price / unit</th>
                      <th scope="col">GST</th>
                      <th scope="col">Availability</th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((listing) => (
                      <tr key={listing.listing_id}>
                        <td>
                          <strong>{listing.title}</strong>
                          <span className="table-subtext">
                            {listing.hsn_sac ? `HSN ${listing.hsn_sac} · ` : ''}{listing.unit}
                          </span>
                        </td>
                        <td>
                          <span className="marketplace-card__seller">
                            {listing.seller.legal_name}
                            <UnverifiedSellerBadge />
                          </span>
                          <span className="table-subtext">State {listing.seller.state_code || '—'}</span>
                        </td>
                        <td>{formatMoney(listing.asking_price, listing.currency_code)}</td>
                        <td>{listing.gst_rate}%</td>
                        <td><span className="table-subtext">{availabilityLabel(listing)}</span></td>
                        <td>
                          <div className="button-row">
                            {buyAction(listing)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="marketplace-pagination button-row">
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={goToPreviousPage}
                disabled={cursor === null && cursorStack.length === 0}
              >
                Previous
              </button>
              <span className="marketplace-pagination__label">Page {cursorStack.length + 1}</span>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => {
                  const next = catalogQuery.data?.next_cursor;
                  if (next) goToNextPage(next);
                }}
                disabled={!catalogQuery.data?.next_cursor}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}

      {buyTarget && (
        <BuyNowModal
          listing={buyTarget}
          ourGstin={ourGstin}
          submitting={buyMutation.isPending}
          error={buyError}
          onClose={() => { setBuyTarget(null); setBuyError(''); }}
          onConfirm={(quantity) => buyMutation.mutate({ listingId: buyTarget.listing_id, quantity })}
        />
      )}

      <StatusToasts
        error={listError}
        success={success}
        onClearError={() => setListError('')}
        onClearSuccess={() => setSuccess('')}
      />
    </div>
  );
}
