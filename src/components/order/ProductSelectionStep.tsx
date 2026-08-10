import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Package, Plus, Minus, ShoppingCart, Star, Clock, Edit3, Trash2 } from "lucide-react";
import { useSpecialPricing } from "@/hooks/useSpecialPricing";
import { useDebounce } from "@/hooks/useDebounce";
import { format } from "date-fns";
import { FloatingCart } from "./FloatingCart";
import { ProductStockFilter } from "./ProductStockFilter";
import { getQuantityIncrement, getQuantityInputStep, getMinimumQuantity, validateQuantity, roundToValidQuantity, getQuantityErrorMessage } from "@/utils/categoryUtils";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  sku: string | null;
  images: string[];
  category?: {
    name: string;
    allows_fractional_quantities?: boolean;
  };
}

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ProductSelectionStepProps {
  cart: CartItem[];
  subtotal: number;
  adjustments: number;
  onCartUpdate: (cart: CartItem[]) => void;
  onAdjustmentsChange: (adjustments: number) => void;
  onNext: () => void;
  onBack: () => void;
  customerTier?: string;
}

export function ProductSelectionStep({
  cart,
  subtotal,
  adjustments,
  onCartUpdate,
  onAdjustmentsChange,
  onNext,
  onBack,
  customerTier = 'residential'
}: ProductSelectionStepProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState<string>("");
  const [editingQuantity, setEditingQuantity] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const { toast } = useToast();
  const { loadSpecialsForProducts, hasActiveSpecial, getSpecialForProduct, applySpecialDiscount } = useSpecialPricing();
  
  // Debounce search query to prevent excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Add decimal input parsing function
  const parseQuantityInput = (input: string): number => {
    // Handle fractional input like "1 1/4" or "1.25"
    const fractionMatch = input.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (fractionMatch) {
      const whole = parseInt(fractionMatch[1]);
      const numerator = parseInt(fractionMatch[2]);
      const denominator = parseInt(fractionMatch[3]);
      return whole + (numerator / denominator);
    }
    
    // Handle simple fraction like "1/4"
    const simpleFractionMatch = input.match(/^(\d+)\/(\d+)$/);
    if (simpleFractionMatch) {
      const numerator = parseInt(simpleFractionMatch[1]);
      const denominator = parseInt(simpleFractionMatch[2]);
      return numerator / denominator;
    }
    
    // Handle decimal input
    const decimal = parseFloat(input);
    return isNaN(decimal) ? 0 : decimal;
  };

  const formatQuantity = (quantity: number): string => {
    // Format to show up to 3 decimal places, removing trailing zeros
    return quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(3).replace(/\.?0+$/, '');
  };

  // Memoized functions to prevent unnecessary re-renders
  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select(`
        *,
        category:product_categories(name, allows_fractional_quantities)
      `)
      .eq('is_active', true)
      .order('stock_quantity', { ascending: false })
      .order('name');

    if (debouncedSearchQuery) {
      query = query.or(`name.ilike.%${debouncedSearchQuery}%,description.ilike.%${debouncedSearchQuery}%,sku.ilike.%${debouncedSearchQuery}%`);
    }

    if (selectedCategory && selectedCategory !== "all") {
      query = query.eq('category_id', selectedCategory);
    }

    // Apply stock filter
    if (stockFilter !== "all") {
      switch (stockFilter) {
        case "in_stock":
          query = query.gt('stock_quantity', 0);
          break;
        case "low_stock":
          query = query.gte('stock_quantity', 1).lte('stock_quantity', 10);
          break;
        case "out_of_stock":
          query = query.eq('stock_quantity', 0);
          break;
        case "backorder":
          query = query.lt('stock_quantity', 0);
          break;
      }
    }

    const { data, error } = await query.limit(500);

    if (!error && data) {
      // Ensure images array exists for each product
      let processedProducts = data.map(product => ({
        ...product,
        images: Array.isArray(product.images) ? product.images : []
      }));

      // Apply relevance sorting when searching
      if (debouncedSearchQuery) {
        const searchLower = debouncedSearchQuery.toLowerCase().trim();
        
        const getRelevanceScore = (name: string) => {
          if (name === searchLower) return 4;          // Exact match
          if (name.startsWith(searchLower)) return 3;  // Starts with
          if (name.includes(searchLower)) return 2;    // Contains in name
          return 1;                                     // In description/SKU only
        };
        
        processedProducts.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aScore = getRelevanceScore(aName);
          const bScore = getRelevanceScore(bName);
          
          // Sort by relevance first, then stock, then name
          if (aScore !== bScore) return bScore - aScore;
          if (a.stock_quantity !== b.stock_quantity) return b.stock_quantity - a.stock_quantity;
          return aName.localeCompare(bName);
        });
      } else {
        // No search - sort by stock then name
        processedProducts.sort((a, b) => {
          if (a.stock_quantity !== b.stock_quantity) return b.stock_quantity - a.stock_quantity;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
      }
      
      setProducts(processedProducts);
    }
    setLoading(false);
  }, [debouncedSearchQuery, selectedCategory, stockFilter]);

  // Keep the latest loaders in refs so the realtime subscription is created
  // ONCE on mount instead of being torn down and re-created on every keystroke.
  const loadProductsRef = useRef(loadProducts);
  loadProductsRef.current = loadProducts;
  const loadCategoriesRef = useRef(loadCategories);
  loadCategoriesRef.current = loadCategories;

  // Load categories and set up realtime subscription on mount
  useEffect(() => {
    loadCategoriesRef.current();

    // Set up realtime subscription with proper cleanup
    const channel = supabase
      .channel('product-selection-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          loadProductsRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load products when search or category changes
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Load specials when the set of product IDs or the customer tier changes
  const productIdsKey = useMemo(
    () => products.map(p => p.id).sort().join(','),
    [products]
  );
  useEffect(() => {
    if (!productIdsKey) return;
    loadSpecialsForProducts(productIdsKey.split(','), customerTier);
  }, [productIdsKey, customerTier, loadSpecialsForProducts]);


  const getProductPrice = useCallback((product: Product) => {
    // Apply special pricing if available
    return hasActiveSpecial(product.id) ? applySpecialDiscount(product.price, product.id) : product.price;
  }, [hasActiveSpecial, applySpecialDiscount]);

  const addToCart = useCallback((product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    const price = getProductPrice(product);
    const increment = getQuantityIncrement(product);
    const defaultQuantity = 1.0; // Always start with 1 for better UX
    
    if (existingItem) {
      const finalQuantity = existingItem.quantity + increment;
      const updatedCart = cart.map(item => {
        if (item.product.id === product.id) {
          return { 
            ...item, 
            quantity: finalQuantity, 
            unit_price: price,
            total_price: price * finalQuantity 
          };
        }
        return item;
      });
      onCartUpdate(updatedCart);
    } else {
      const newItem: CartItem = {
        product,
        quantity: defaultQuantity,
        unit_price: price,
        total_price: price * defaultQuantity
      };
      onCartUpdate([...cart, newItem]);
    }
  }, [cart, getProductPrice, onCartUpdate]);

  const updateQuantity = useCallback((productId: string, newQuantity: number) => {
    const cartItem = cart.find(item => item.product.id === productId);
    if (!cartItem) return;
    
    const minQuantity = getMinimumQuantity(cartItem.product);
    const finalQuantity = Math.max(minQuantity, roundToValidQuantity(newQuantity, cartItem.product));

    const updatedCart = cart.map(item => {
      if (item.product.id === productId) {
        const price = getProductPrice(item.product);
        return { 
          ...item, 
          quantity: finalQuantity, 
          unit_price: price,
          total_price: price * finalQuantity 
        };
      }
      return item;
    });
    onCartUpdate(updatedCart);
  }, [cart, getProductPrice, onCartUpdate]);

  const removeFromCart = (productId: string) => {
    onCartUpdate(cart.filter(item => item.product.id !== productId));
  };

  const handleQuantityEdit = (productId: string, currentQuantity: number) => {
    setEditingQuantity(productId);
    setInputValue(formatQuantity(currentQuantity));
  };

  const handleQuantitySubmit = (productId: string) => {
    const cartItem = cart.find(item => item.product.id === productId);
    if (!cartItem) return;

    const newQuantity = parseQuantityInput(inputValue);
    const minQuantity = getMinimumQuantity(cartItem.product);
    
    if (isNaN(newQuantity) || newQuantity < 0) {
      toast({
        title: "Invalid quantity",
        description: getQuantityErrorMessage(cartItem.product),
        variant: "destructive",
      });
      return;
    }

    if (!validateQuantity(newQuantity, cartItem.product)) {
      toast({
        title: "Invalid quantity",
        description: getQuantityErrorMessage(cartItem.product),
        variant: "destructive",
      });
      return;
    }

    const finalQuantity = newQuantity === 0 ? minQuantity : newQuantity;
    updateQuantity(productId, finalQuantity);
    setEditingQuantity(null);
    setInputValue("");
  };

  const handleQuantityCancel = () => {
    setEditingQuantity(null);
    setInputValue("");
  };

  const applyAdjustment = () => {
    const value = parseFloat(adjustmentValue);
    if (isNaN(value)) return;

    let adjustment = 0;
    if (adjustmentType === "percentage") {
      adjustment = (subtotal * value) / 100;
    } else {
      adjustment = value;
    }

    onAdjustmentsChange(adjustment);
    setAdjustmentValue("");
  };

  const getCartQuantity = useCallback((productId: string) => {
    const item = cart.find(item => item.product.id === productId);
    return item ? item.quantity : 0;
  }, [cart]);

  const grandTotal = subtotal + adjustments;

  return (
    <>
      {/* Full-Width Product Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Step 2: Select Products
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products by name, description, or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ProductStockFilter value={stockFilter} onChange={setStockFilter} />
          </div>

          {loading && <div className="text-center py-4">Loading products...</div>}

          {!loading && (
            <div className="text-sm text-gray-600 mb-2">
              Showing {products.length} product{products.length !== 1 ? 's' : ''} {searchQuery && `for "${searchQuery}"`}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
            {products.map((product) => {
              const productSpecial = getSpecialForProduct(product.id);
              const originalPrice = product.price;
              const currentPrice = getProductPrice(product);
              const hasSpecial = hasActiveSpecial(product.id) && currentPrice !== originalPrice;

              return (
                <div key={product.id} className="border rounded-lg p-4 relative">
                  {hasSpecial && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-red-500 text-white flex items-center gap-1 text-xs">
                        <Star className="w-3 h-3" />
                        SPECIAL
                      </Badge>
                    </div>
                  )}

                  {product.images && product.images.length > 0 && (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-32 object-cover rounded mb-3"
                    />
                  )}
                  
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{product.name}</h4>
                      {product.category?.name && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {product.category.name}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      {hasSpecial ? (
                        <div>
                          <div className="text-xs text-gray-500 line-through">
                            AU${originalPrice.toFixed(2)}
                          </div>
                          <div className="font-semibold text-red-600">
                            AU${currentPrice.toFixed(2)}
                          </div>
                        </div>
                      ) : (
                        <div className="font-semibold text-green-600">
                          AU${currentPrice.toFixed(2)}
                        </div>
                      )}
                      <div className={`text-xs font-medium ${
                        product.stock_quantity > 10 
                          ? 'text-green-600' 
                          : product.stock_quantity > 0 
                          ? 'text-yellow-600' 
                          : product.stock_quantity === 0 
                          ? 'text-red-600' 
                          : 'text-orange-600'
                      }`}>
                        {product.stock_quantity > 0 
                          ? `Stock: ${product.stock_quantity}` 
                          : product.stock_quantity === 0 
                          ? 'Out of Stock' 
                          : `Backorder (${Math.abs(product.stock_quantity)})`
                        }
                      </div>
                    </div>
                  </div>

                  {/* Special Details */}
                  {productSpecial && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <div className="text-red-700 font-medium">
                        {productSpecial.special_name}
                      </div>
                      <div className="text-red-600">
                        {productSpecial.discount_type === 'percentage' 
                          ? `${productSpecial.discount_value}% off` 
                          : `AU$${productSpecial.discount_value.toFixed(2)} off`
                        }
                      </div>
                      <div className="flex items-center gap-1 text-red-600">
                        <Clock className="w-3 h-3" />
                        Ends: {format(new Date(productSpecial.end_date), 'd MMM')}
                      </div>
                    </div>
                  )}
                  
                  {product.description && (
                    <p className="text-xs text-gray-600 mb-2">{product.description}</p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    {product.sku && (
                      <span className="text-xs text-gray-500">SKU: {product.sku}</span>
                    )}
                    
                    {getCartQuantity(product.id) > 0 ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(product.id, Math.max(1, getCartQuantity(product.id) - 1))}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        
                        {editingQuantity === product.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              className="w-16 h-8 text-center text-xs"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleQuantitySubmit(product.id);
                                } else if (e.key === 'Escape') {
                                  handleQuantityCancel();
                                }
                              }}
                              step={getQuantityInputStep(product)}
                              min="0.001"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={() => handleQuantitySubmit(product.id)} className="h-8 px-1">
                              ✓
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleQuantityCancel} className="h-8 px-1">
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => handleQuantityEdit(product.id, getCartQuantity(product.id))}
                            className="h-8 px-2 text-xs font-medium hover:bg-accent min-w-12"
                          >
                            {formatQuantity(getCartQuantity(product.id))}
                            <Edit3 className="w-3 h-3 ml-1 opacity-50" />
                          </Button>
                        )}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(product.id, getCartQuantity(product.id) + 1)}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => addToCart(product)}>
                        Add to Cart
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Floating Cart */}
      <FloatingCart
        cart={cart}
        subtotal={subtotal}
        adjustments={adjustments}
        onCartUpdate={onCartUpdate}
        onAdjustmentsChange={onAdjustmentsChange}
        onNext={onNext}
        onBack={onBack}
        hasActiveSpecial={hasActiveSpecial}
        getProductPrice={getProductPrice}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        handleQuantityEdit={handleQuantityEdit}
        handleQuantitySubmit={handleQuantitySubmit}
        handleQuantityCancel={handleQuantityCancel}
        editingQuantity={editingQuantity}
        inputValue={inputValue}
        setInputValue={setInputValue}
        formatQuantity={formatQuantity}
        applyAdjustment={applyAdjustment}
        adjustmentType={adjustmentType}
        setAdjustmentType={setAdjustmentType}
        adjustmentValue={adjustmentValue}
        setAdjustmentValue={setAdjustmentValue}
      />
    </>
  );
}
