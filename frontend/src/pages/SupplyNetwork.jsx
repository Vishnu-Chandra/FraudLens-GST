import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { businessApi, investigationApi } from '../services/api';
import EntityNode from '../components/Graph/EntityNode';

const riskPalette = {
  low: { solid: '#22C55E', soft: '#D1FAE5' },
  medium: { solid: '#F59E0B', soft: '#FEF3C7' },
  high: { solid: '#EF4444', soft: '#FEE2E2' },
};

function toTone(cat) {
  const c = String(cat || '').toLowerCase();
  if (c === 'low') return 'low';
  if (c === 'high' || c === 'critical') return 'high';
  return 'medium';
}

export default function SupplyNetwork() {
  const navigate = useNavigate();
  const [selectedGstin, setSelectedGstin] = useState(''); // empty means show all businesses
  const [search, setSearch] = useState('');
  const [depth, setDepth] = useState(1);
  const [riskFilter, setRiskFilter] = useState('all'); // all|high|medium|low
  const [minAmount, setMinAmount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all'); // all|matched|mismatch|fraud|circular
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hover, setHover] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allBusinesses, setAllBusinesses] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [networkRaw, setNetworkRaw] = useState({ nodes: [], edges: [] });
  const [displayedTransactions, setDisplayedTransactions] = useState([]); // Track actually displayed transactions

  // Load all businesses and their transactions on mount
  useEffect(() => {
    let alive = true;
    setLoading(true);
    investigationApi.getBusinesses({ limit: 20 })
      .then(async (list) => {
        if (!alive) return;
        setAllBusinesses(list || []);
        
        // Fetch transactions for top 10 high-risk businesses to build network
        const topBusinesses = (list || []).slice(0, 10);
        const transactionPromises = topBusinesses.map(b => 
          businessApi.getTransactions(b.gstin, { limit: 8 }).catch(() => ({ invoices: [] }))
        );
        
        const transactionResults = await Promise.all(transactionPromises);
        const allTxRaw = transactionResults.flatMap(t => t?.invoices || []);
        const dedupedTxMap = new Map();
        allTxRaw.forEach((tx) => {
          const key = [
            tx.invoice_no || tx.invoice_id || '',
            tx.supplier_gstin || '',
            tx.buyer_gstin || ''
          ].join('|');
          if (!dedupedTxMap.has(key)) dedupedTxMap.set(key, tx);
        });
        const allTx = Array.from(dedupedTxMap.values());
        setAllTransactions(allTx);
        
        // Build network from all businesses and transactions
        const businessMap = new Map(list.map(b => [b.gstin, {
          gstin: b.gstin,
          name: b.businessName || b.business_name || b.gstin,
          riskCategory: b.riskCategory || 'medium',
          riskScore: b.riskScore || 0,
        }]));
        
        // Add suppliers/buyers found in transactions
        allTx.forEach(tx => {
          if (tx.supplier_gstin && !businessMap.has(tx.supplier_gstin)) {
            businessMap.set(tx.supplier_gstin, {
              gstin: tx.supplier_gstin,
              name: tx.supplier_name || tx.supplier_gstin,
              riskCategory: 'medium',
              riskScore: 0,
            });
          }
          if (tx.buyer_gstin && !businessMap.has(tx.buyer_gstin)) {
            businessMap.set(tx.buyer_gstin, {
              gstin: tx.buyer_gstin,
              name: tx.buyer_gstin,
              riskCategory: 'medium',
              riskScore: 0,
            });
          }
        });
        
        const nodes = Array.from(businessMap.values());
        setNetworkRaw({ nodes, edges: allTx });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // fetch specific network when a GSTIN is selected
  useEffect(() => {
    if (!selectedGstin) return; // don't fetch if nothing selected
    let alive = true;
    setLoading(true);
    Promise.all([
      businessApi.getNetwork(selectedGstin),
      businessApi.getTransactions(selectedGstin, { limit: 80 })
    ])
      .then(([net, txData]) => {
        if (!alive) return;
        const nodes = net?.nodes || net?.data?.nodes || [];
        const edges = net?.edges || net?.data?.edges || [];
        const transactions = txData?.invoices || [];
        setNetworkRaw({ nodes, edges: transactions });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [selectedGstin]);

  // Smart sampling function to get 70-80 transactions with all types represented
  const smartSampleTransactions = (transactions, circularEdges = new Set(), targetCount = 75) => {
    if (transactions.length <= targetCount) return transactions;

    // Categorize transactions
    const categorized = {
      circular: [],
      fraud: [],
      mismatch: [],
      partial: [],
      matched: [],
    };

    transactions.forEach(tx => {
      const isCircular = circularEdges.has(`${tx.supplier_gstin}->${tx.buyer_gstin}`);
      const status = String(tx.status || '').toLowerCase();
      
      if (isCircular) {
        categorized.circular.push(tx);
      } else if (status === 'fraud') {
        categorized.fraud.push(tx);
      } else if (status === 'mismatch') {
        categorized.mismatch.push(tx);
      } else if (status === 'partial') {
        categorized.partial.push(tx);
      } else {
        categorized.matched.push(tx);
      }
    });

    // Prioritized sampling: ensure all types are represented
    const result = [];
    
    // Take all circular (high priority) - limit to avoid clutter
    result.push(...categorized.circular.slice(0, Math.min(12, categorized.circular.length)));
    
    // Take important fraud cases - limit to key instances
    result.push(...categorized.fraud.slice(0, Math.min(8, categorized.fraud.length)));
    
    // Calculate remaining slots
    let remaining = targetCount - result.length;
    
    // Distribute remaining slots with better balance
    const otherCategories = ['mismatch', 'partial', 'matched'];
    const otherTotal = otherCategories.reduce((sum, cat) => sum + categorized[cat].length, 0);
    
    if (otherTotal > 0 && remaining > 0) {
      // Fixed allocation for better visibility
      const allocation = {
        mismatch: Math.min(10, categorized.mismatch.length),
        partial: Math.min(5, categorized.partial.length),
        matched: 0 // Will fill remaining
      };
      
      allocation.matched = Math.max(0, remaining - allocation.mismatch - allocation.partial);
      
      otherCategories.forEach(cat => {
        if (categorized[cat].length > 0 && allocation[cat] > 0) {
          // Stable deterministic selection - use invoice_number or _id for consistent sorting
          const sorted = [...categorized[cat]].sort((a, b) => {
            const idA = a.invoice_number || a._id || '';
            const idB = b.invoice_number || b._id || '';
            return String(idA).localeCompare(String(idB));
          });
          result.push(...sorted.slice(0, allocation[cat]));
        }
      });
    }
    
    return result.slice(0, targetCount);
  };

  // build RF nodes/edges with filters and derived metrics
  useEffect(() => {
    const center = selectedGstin;
    const baseNodes = Array.isArray(networkRaw.nodes) ? networkRaw.nodes : [];
    const baseTransactions = Array.isArray(networkRaw.edges) ? networkRaw.edges : [];

    // If no center selected, show network of all transactions
    if (!center) {
      // Filter transactions by amount
      const filteredTx = baseTransactions.filter(tx => (Number(tx.taxable_value) || 0) >= minAmount);
      
      // Filter by risk if needed
      const filteredNodes = baseNodes.filter((n) => {
        if (riskFilter === 'all') return true;
        return toTone(n.riskCategory) === riskFilter;
      });
      
      const nodeIds = new Set(filteredNodes.map(n => n.gstin));
      const relevantTx = filteredTx.filter(tx => 
        nodeIds.has(tx.supplier_gstin) || nodeIds.has(tx.buyer_gstin)
      );
      
      // FIRST: Detect circular trading BEFORE building nodes
      const buildGraph = () => {
        const graph = new Map();
        relevantTx.forEach(tx => {
          if (tx.supplier_gstin && tx.buyer_gstin) {
            if (!graph.has(tx.supplier_gstin)) graph.set(tx.supplier_gstin, []);
            graph.get(tx.supplier_gstin).push(tx.buyer_gstin);
          }
        });
        return graph;
      };
      
      const findCircularNodes = (graph) => {
        const visited = new Set();
        const recStack = new Set();
        const circularNodes = new Set();
        
        const dfs = (node, path = []) => {
          if (recStack.has(node)) {
            // Found a cycle - add all nodes in the cycle
            const cycleStart = path.indexOf(node);
            if (cycleStart !== -1) {
              path.slice(cycleStart).forEach(n => circularNodes.add(n));
              circularNodes.add(node);
            }
            return true;
          }
          if (visited.has(node)) return false;
          
          visited.add(node);
          recStack.add(node);
          path.push(node);
          
          const neighbors = graph.get(node) || [];
          for (const neighbor of neighbors) {
            dfs(neighbor, [...path]);
          }
          
          recStack.delete(node);
          return false;
        };
        
        // Start DFS from each node
        for (const node of graph.keys()) {
          if (!visited.has(node)) {
            dfs(node);
          }
        }
        
        return circularNodes;
      };
      
      const graph = buildGraph();
      const circularNodes = findCircularNodes(graph);
      console.log(`🔍 Detected ${circularNodes.size} businesses in circular trading:`, Array.from(circularNodes));
      
      // NOW: Build business nodes with circular detection
      const businessNodes = filteredNodes.map((n) => {
        const tone = toTone(n.riskCategory);
        const colors = riskPalette[tone] || riskPalette.medium;
        const size = tone === 'high' ? 75 : tone === 'medium' ? 65 : 60;
        
        return {
          gstin: n.gstin,
          tone,
          colors,
          size,
          name: n.name || n.business_name || n.gstin,
          riskCategory: n.riskCategory,
          riskScore: n.riskScore || 0,
        };
      });
      
      // Position businesses - circular trading nodes to the side, others in main circle
      const mainRadius = 400; // Further increased for 70-80 transactions
      const circularClusterX = 650; // More separation for clarity
      const circularClusterY = 0;   // Centered vertically
      const circularRadius = 140;   // Increased for better circular cluster spacing
      
      // Separate circular and non-circular nodes
      const circularBusinesses = businessNodes.filter(n => circularNodes.has(n.gstin));
      const normalBusinesses = businessNodes.filter(n => !circularNodes.has(n.gstin));
      
      const rfBusinessNodes = [];
      
      // Position circular trading businesses to the side in their own cluster
      if (circularBusinesses.length > 0) {
        const circularAngleStep = (2 * Math.PI) / circularBusinesses.length;
        circularBusinesses.forEach((n, i) => {
          const angle = i * circularAngleStep;
          const x = circularClusterX + Math.cos(angle) * circularRadius;
          const y = circularClusterY + Math.sin(angle) * circularRadius;
          
          rfBusinessNodes.push({
            id: n.gstin,
            type: 'entity',
            position: { x, y },
            data: {
              kind: 'fraud',
              title: (n.name).slice(0, 10),
              subtitle: n.gstin.slice(0, 6),
              size: 95, // Larger size for emphasis
              metaLeft: '🔴',
              metaRight: `R:${n.riskScore}`,
              selected: selectedNode?.gstin === n.gstin,
              emphasis: true,
              meta: {
                gstin: n.gstin,
                name: n.name,
                riskScore: n.riskScore,
                riskCategory: n.riskCategory,
                invoiceCount: relevantTx.filter(tx => 
                  tx.supplier_gstin === n.gstin || tx.buyer_gstin === n.gstin
                ).length,
              },
              onClick: () => {
                setSelectedNode({
                  gstin: n.gstin,
                  name: n.name,
                  riskCategory: n.riskCategory,
                  invoiceCount: relevantTx.filter(tx => 
                    tx.supplier_gstin === n.gstin || tx.buyer_gstin === n.gstin
                  ).length,
                });
              },
            },
          });
        });
      }
      
      // Position normal businesses in main circle
      if (normalBusinesses.length > 0) {
        const normalAngleStep = (2 * Math.PI) / normalBusinesses.length;
        normalBusinesses.forEach((n, i) => {
          const angle = i * normalAngleStep;
          const x = Math.cos(angle) * mainRadius;
          const y = Math.sin(angle) * mainRadius;
          
          rfBusinessNodes.push({
            id: n.gstin,
            type: 'entity',
            position: { x, y },
            data: {
              kind: n.tone === 'high' ? 'buyer' : n.tone === 'medium' ? 'center' : 'supplier',
              title: (n.name).slice(0, 10),
              subtitle: n.gstin.slice(0, 6),
              size: n.size,
              metaLeft: n.tone.toUpperCase(),
              metaRight: `R:${n.riskScore}`,
              selected: selectedNode?.gstin === n.gstin,
              emphasis: n.tone === 'high',
              meta: {
                gstin: n.gstin,
                name: n.name,
                riskScore: n.riskScore,
                riskCategory: n.riskCategory,
                invoiceCount: relevantTx.filter(tx => 
                  tx.supplier_gstin === n.gstin || tx.buyer_gstin === n.gstin
                ).length,
              },
              onClick: () => {
                setSelectedNode({
                  gstin: n.gstin,
                  name: n.name,
                  riskCategory: n.riskCategory,
                  invoiceCount: relevantTx.filter(tx => 
                    tx.supplier_gstin === n.gstin || tx.buyer_gstin === n.gstin
                  ).length,
                });
              },
            },
          });
        });
      }
      
      // Track which edges are part of circular trading (build this early for smart sampling)
      const circularEdges = new Set();
      relevantTx.forEach(tx => {
        if (tx.supplier_gstin && tx.buyer_gstin && 
            circularNodes.has(tx.supplier_gstin) && circularNodes.has(tx.buyer_gstin)) {
          circularEdges.add(`${tx.supplier_gstin}->${tx.buyer_gstin}`);
        }
      });
      
      // Build invoice nodes between businesses - track unique invoices
      const invoiceNodeMap = new Map();
      // Smart sample 70-80 transactions with all types represented
      const sampledTxForNodes = smartSampleTransactions(relevantTx, circularEdges, 75);
      sampledTxForNodes.forEach((tx, i) => {
        const invNo = tx.invoice_no || `auto-${i}`;
        if (invoiceNodeMap.has(invNo)) return; // Skip duplicates
        
        const supplierNode = rfBusinessNodes.find(n => n.id === tx.supplier_gstin);
        const buyerNode = rfBusinessNodes.find(n => n.id === (tx.buyer_gstin || tx.supplier_gstin));
        
        if (!supplierNode || !buyerNode) return;
        
        // Position invoice between supplier and buyer with slight variation to reduce overlap
        const baseX = (supplierNode.position.x + buyerNode.position.x) / 2;
        const baseY = (supplierNode.position.y + buyerNode.position.y) / 2;
        const variation = 30; // Slight variation for natural look
        const x = baseX + (Math.random() - 0.5) * variation;
        const y = baseY + (Math.random() - 0.5) * variation;
        
        const status = String(tx.status || '').toLowerCase();
        const kind = (status === 'fraud' || status === 'mismatch') ? 'fraud' : 'invoice';
        const amount = Number(tx.taxable_value || 0);
        
        invoiceNodeMap.set(invNo, {
          id: `inv-${invNo}`,
          type: 'entity',
          position: { x, y },
          data: {
            kind: 'invoice',
            title: `INV-${String(invNo).slice(-3)}`,
            subtitle: amount ? `${Math.round(amount / 1000)}k` : '',
            metaLeft: kind === 'fraud' ? '⚠' : status === 'matched' ? '✓' : '',
            size: 45, // Smaller for 70-80 transactions
            emphasis: kind === 'fraud',
            selected: false,
            meta: { 
              gstin: tx.supplier_gstin, 
              name: invNo, 
              riskScore: status, 
              riskCategory: kind === 'fraud' ? 'high' : 'low',
              invoiceCount: 1 
            },
            onClick: () => {},
          },
        });
      });
      
      const invoiceNodes = Array.from(invoiceNodeMap.values());
      const allNodes = [...rfBusinessNodes, ...invoiceNodes];
      
      // Build edges with status-based styling
      const edgeForStatus = (status) => {
        const s = String(status || '').toLowerCase();
        if (s === 'matched' || s === 'match') return { color: '#22C55E', dash: undefined, label: 'MATCHED' };
        if (s === 'partial') return { color: '#F59E0B', dash: '6 4', label: 'PARTIAL' };
        if (s === 'mismatch') return { color: '#EF4444', dash: '6 4', label: 'MISMATCH' };
        if (s === 'fraud') return { color: '#DC2626', dash: undefined, label: 'FRAUD' };
        return { color: '#3B82F6', dash: undefined, label: '' };
      };
      
      const rfEdges = [];
      
      // Apply status filter
      let filteredTxForDisplay = relevantTx;
      if (statusFilter !== 'all') {
        filteredTxForDisplay = relevantTx.filter(tx => {
          const isCircular = circularEdges.has(`${tx.supplier_gstin}->${tx.buyer_gstin}`);
          const status = String(tx.status || '').toLowerCase();
          
          if (statusFilter === 'circular') return isCircular;
          if (statusFilter === 'matched') return status === 'matched' && !isCircular;
          if (statusFilter === 'mismatch') return (status === 'mismatch' || status === 'fraud') && !isCircular;
          if (statusFilter === 'partial') return status === 'partial' && !isCircular;
          return true;
        });
      }
      
      // Add regular transaction edges (smart sampled for 70-80 with all types)
      const addedEdgeIds = new Set();
      const sampledTxForEdges = smartSampleTransactions(filteredTxForDisplay, circularEdges, 75);
      sampledTxForEdges.forEach((tx, i) => {
        const invNo = tx.invoice_no || `auto-${i}`;
        const invId = `inv-${invNo}`;
        const seller = tx.supplier_gstin;
        const buyer = tx.buyer_gstin || seller;
        
        // Check if this edge is part of circular trading
        const isCircular = circularEdges.has(`${seller}->${buyer}`);
        const style = isCircular 
          ? { color: '#DC2626', dash: undefined, label: 'CIRCULAR' }
          : edgeForStatus(tx.status);
        
        // Edge from seller to invoice
        const sellerEdgeId = `e-${seller}-${invId}`;
        if (seller && rfBusinessNodes.find(n => n.id === seller) && !addedEdgeIds.has(sellerEdgeId)) {
          addedEdgeIds.add(sellerEdgeId);
          rfEdges.push({
            id: sellerEdgeId,
            source: seller,
            target: invId,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
            animated: isCircular || style.label !== 'MATCHED',
            label: style.label || undefined,
            labelStyle: style.label ? { 
              fill: isCircular ? '#FFFFFF' : '#6B7280', 
              fontSize: isCircular ? 10 : 9, 
              fontWeight: isCircular ? 800 : 700 
            } : undefined,
            labelBgStyle: style.label ? { 
              fill: isCircular ? '#DC2626' : '#FFFFFF', 
              fillOpacity: 1 
            } : undefined,
            labelBgPadding: style.label ? [4, 2] : undefined,
            labelBgBorderRadius: style.label ? 4 : undefined,
            style: { 
              stroke: style.color, 
              strokeWidth: isCircular ? 2.5 : 1.2, 
              strokeDasharray: style.dash, 
              opacity: isCircular ? 1 : (style.label !== 'MATCHED' ? 0.85 : 0.6)
            },
          });
        }
        
        // Edge from invoice to buyer
        const buyerEdgeId = `e-${invId}-${buyer}`;
        if (buyer && buyer !== seller && rfBusinessNodes.find(n => n.id === buyer) && !addedEdgeIds.has(buyerEdgeId)) {
          addedEdgeIds.add(buyerEdgeId);
          rfEdges.push({
            id: buyerEdgeId,
            source: invId,
            target: buyer,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
            animated: isCircular || style.label !== 'MATCHED',
            label: style.label || undefined,
            labelStyle: style.label ? { 
              fill: isCircular ? '#FFFFFF' : '#6B7280', 
              fontSize: isCircular ? 10 : 9, 
              fontWeight: isCircular ? 800 : 700 
            } : undefined,
            labelBgStyle: style.label ? { 
              fill: isCircular ? '#DC2626' : '#FFFFFF', 
              fillOpacity: 1 
            } : undefined,
            labelBgPadding: style.label ? [4, 2] : undefined,
            labelBgBorderRadius: style.label ? 4 : undefined,
            style: { 
              stroke: style.color, 
              strokeWidth: isCircular ? 2.5 : 1.4, 
              strokeDasharray: style.dash, 
              opacity: isCircular ? 1 : (style.label !== 'MATCHED' ? 0.85 : 0.6)
            },
          });
        }
      });
      
      setNodes(allNodes);
      setEdges(rfEdges);
      setDisplayedTransactions(sampledTxForEdges); // Track displayed transactions for insights
      return;
    }

    // When a specific business is selected, baseEdges are transactions
    const transactions = baseTransactions;
    
    // derive basic metrics per node from transactions
    const degreeMap = new Map();
    transactions.forEach((tx) => {
      if (tx.supplier_gstin) degreeMap.set(tx.supplier_gstin, (degreeMap.get(tx.supplier_gstin) || 0) + 1);
      if (tx.buyer_gstin) degreeMap.set(tx.buyer_gstin, (degreeMap.get(tx.buyer_gstin) || 0) + 1);
    });

    // apply transaction amount filter
    const filteredTx = transactions.filter((tx) => (Number(tx.taxable_value) || 0) >= minAmount);

    // collect GSTINs actually used after amount filter
    const visibleIds = new Set([center]);
    filteredTx.forEach((tx) => {
      if (tx.supplier_gstin) visibleIds.add(tx.supplier_gstin);
      if (tx.buyer_gstin) visibleIds.add(tx.buyer_gstin);
    });

    const rfNodesBase = baseNodes
      .filter((n) => visibleIds.has(n.gstin))
      .map((n) => {
        const tone = toTone(n.riskCategory);
        const colors = riskPalette[tone] || riskPalette.medium;
        const isCenter = n.gstin === center;
        const invoices = degreeMap.get(n.gstin) || 1;
        const size = isCenter ? 80 : Math.max(50, Math.min(75, 40 + invoices * 2.5));
        return {
          id: n.gstin,
          kind: isCenter ? 'center' : tone === 'high' ? 'buyer' : 'supplier',
          colors,
          isCenter,
          invoices,
          size,
          riskCategory: n.riskCategory || (isCenter ? 'high' : 'medium'),
          name: n.name || n.business_name || n.gstin,
        };
      });

    // risk filter
    const rfNodesFiltered = rfNodesBase.filter((n) => {
      if (riskFilter === 'all') return true;
      return toTone(n.riskCategory) === riskFilter;
    });
    const rfIds = new Set(rfNodesFiltered.map((n) => n.id));

    const relevantTx = filteredTx.filter(
      (tx) => rfIds.has(tx.supplier_gstin) || rfIds.has(tx.buyer_gstin) || rfIds.has(center)
    );

    // layout similar to Business page: suppliers left, buyers right, center in middle
    const centerNode = rfNodesFiltered.find((n) => n.id === center) || rfNodesFiltered[0];

    // Separate suppliers and buyers based on transactions
    const incomingToCenter = new Set();
    const outgoingFromCenter = new Set();
    
    relevantTx.forEach(tx => {
      if (tx.buyer_gstin === center && tx.supplier_gstin) {
        incomingToCenter.add(tx.supplier_gstin);
      }
      if (tx.supplier_gstin === center && tx.buyer_gstin) {
        outgoingFromCenter.add(tx.buyer_gstin);
      }
    });

    const left = rfNodesFiltered.filter((n) => incomingToCenter.has(n.id) && n.id !== center);
    const right = rfNodesFiltered.filter((n) => outgoingFromCenter.has(n.id) && n.id !== center);
    const mid = centerNode ? [centerNode] : [];
    const others = rfNodesFiltered.filter(
      (n) =>
        !incomingToCenter.has(n.id) &&
        !outgoingFromCenter.has(n.id) &&
        n.id !== center,
    );

    const verticalSpacing = 100;
    const assignColumn = (arr, x, yStart) =>
      arr.map((n, i) => ({
        ...n,
        position: { x, y: yStart + i * verticalSpacing },
      }));

    const placedNodes = [
      ...assignColumn(left, -300, 40),
      ...assignColumn(mid, 0, 140),
      ...assignColumn(right, 300, 40),
      ...assignColumn(others, 0, 350),
    ];

    const rfBusinessNodes = placedNodes.map((n) => ({
      id: n.id,
      type: 'entity',
      position: n.position,
      data: {
        kind: n.kind,
        title: n.name.slice(0, 10),
        subtitle: n.id.slice(0, 6),
        size: n.size,
        metaLeft: n.id === center ? 'CENTER' : undefined,
        metaRight: `${n.invoices}tx`,
        selected: selectedNode?.gstin === n.id,
        emphasis: n.id === center,
        meta: {
          gstin: n.id,
          name: n.name,
          riskScore: n.invoices,
          riskCategory: n.riskCategory,
          invoiceCount: n.invoices,
        },
        onClick: () => {
          setSelectedNode({
            gstin: n.id,
            name: n.name,
            riskCategory: n.riskCategory,
            invoiceCount: n.invoices,
          });
        },
      },
    }));
    
    // Add invoice nodes between businesses (smart sampled for 70-80 with all types)
    const sampledTxForSpecificBusiness = smartSampleTransactions(relevantTx, new Set(), 75);
    const invoiceNodes = sampledTxForSpecificBusiness.map((tx, i) => {
      const supplierNode = rfBusinessNodes.find(n => n.id === tx.supplier_gstin);
      const buyerNode = rfBusinessNodes.find(n => n.id === (tx.buyer_gstin || center));
      
      if (!supplierNode || !buyerNode) return null;
      
      // Position invoice between supplier and buyer with reduced variation for clarity
      const baseX = (supplierNode.position.x + buyerNode.position.x) / 2;
      const baseY = (supplierNode.position.y + buyerNode.position.y) / 2;
      const variation = 25; // Balanced variation for 70-80 transactions
      const x = baseX + (Math.random() - 0.5) * variation;
      const y = baseY + (Math.random() - 0.5) * variation;
      
      const status = String(tx.status || '').toLowerCase();
      const kind = (status === 'fraud' || status === 'mismatch') ? 'fraud' : 'invoice';
      const amount = Number(tx.taxable_value || 0);
      
      return {
        id: `inv-${tx.invoice_no || i}`,
        type: 'entity',
        position: { x, y },
        data: {
          kind: 'invoice',
          title: `${String(tx.invoice_no || '').slice(-4) || i}`,
          subtitle: amount ? `₹${Math.round(amount / 1000)}k` : '',
          metaLeft: status === 'fraud' ? '⚠' : status === 'matched' ? '✓' : status === 'mismatch' ? '✗' : '',
          size: 42, // Smaller for 70-80 transactions
          emphasis: kind === 'fraud',
          selected: false,
          meta: { 
            gstin: tx.supplier_gstin, 
            name: tx.invoice_no, 
            riskScore: status, 
            riskCategory: kind === 'fraud' ? 'high' : status === 'mismatch' ? 'medium' : 'low',
            invoiceCount: 1 
          },
          onClick: () => {},
        },
      };
    }).filter(Boolean);
    
    const allNodes = [...rfBusinessNodes, ...invoiceNodes];

    // Build edges with status-based styling
    const edgeForStatus = (status) => {
      const s = String(status || '').toLowerCase();
      if (s === 'matched' || s === 'match') return { color: '#22C55E', dash: undefined, label: 'MATCH' };
      if (s === 'partial') return { color: '#F59E0B', dash: '6 4', label: 'PARTIAL' };
      if (s === 'mismatch') return { color: '#EF4444', dash: '6 4', label: 'MISMATCH' };
      if (s === 'fraud') return { color: '#DC2626', dash: undefined, label: 'FRAUD' };
      return { color: '#3B82F6', dash: undefined, label: '' };
    };
    
    const rfEdges = [];
    sampledTxForSpecificBusiness.forEach((tx, i) => {
      const invId = `inv-${tx.invoice_no || i}`;
      const seller = tx.supplier_gstin;
      const buyer = tx.buyer_gstin || center;
      const style = edgeForStatus(tx.status);
      
      if (seller && rfBusinessNodes.find(n => n.id === seller)) {
        rfEdges.push({
          id: `e-${seller}-${invId}`,
          source: seller,
          target: invId,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
          animated: style.label !== 'MATCH',
          label: style.label || undefined,
          labelStyle: style.label ? { fill: '#6B7280', fontSize: 9, fontWeight: 700 } : undefined,
          labelBgStyle: style.label ? { fill: '#FFFFFF', fillOpacity: 0.92 } : undefined,
          labelBgPadding: style.label ? [4, 2] : undefined,
          labelBgBorderRadius: style.label ? 4 : undefined,
          style: { 
            stroke: style.color, 
            strokeWidth: 1.2, 
            strokeDasharray: style.dash, 
            opacity: style.label !== 'MATCH' ? 0.85 : 0.6 
          },
        });
      }
      
      if (buyer && rfBusinessNodes.find(n => n.id === buyer)) {
        rfEdges.push({
          id: `e-${invId}-${buyer}`,
          source: invId,
          target: buyer,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
          animated: style.label !== 'MATCH',
          label: style.label || undefined,
          labelStyle: style.label ? { fill: '#6B7280', fontSize: 9, fontWeight: 700 } : undefined,
          labelBgStyle: style.label ? { fill: '#FFFFFF', fillOpacity: 0.92 } : undefined,
          labelBgPadding: style.label ? [4, 2] : undefined,
          labelBgBorderRadius: style.label ? 4 : undefined,
          style: { 
            stroke: style.color, 
            strokeWidth: 1.4, 
            strokeDasharray: style.dash, 
            opacity: style.label !== 'MATCH' ? 0.85 : 0.6 
          },
        });
      }
    });

    // circular trading detection between businesses
    const edgeKey = (a, b) => `${a}->${b}`;
    const businessEdgeSet = new Map();
    relevantTx.forEach(tx => {
      if (tx.supplier_gstin && tx.buyer_gstin) {
        const key = edgeKey(tx.supplier_gstin, tx.buyer_gstin);
        businessEdgeSet.set(key, (businessEdgeSet.get(key) || 0) + 1);
      }
    });
    
    // Add circular edges only if bidirectional flow exists
    const addedCircularPairs = new Set();
    relevantTx.forEach(tx => {
      if (tx.supplier_gstin && tx.buyer_gstin) {
        const forward = edgeKey(tx.supplier_gstin, tx.buyer_gstin);
        const reverse = edgeKey(tx.buyer_gstin, tx.supplier_gstin);
        
        // Check if reverse direction exists
        if (businessEdgeSet.has(reverse)) {
          // Create unique pair ID (sorted to avoid duplicates)
          const pairId = [tx.supplier_gstin, tx.buyer_gstin].sort().join('-');
          
          if (!addedCircularPairs.has(pairId) && rfBusinessNodes.find(n => n.id === tx.supplier_gstin) && rfBusinessNodes.find(n => n.id === tx.buyer_gstin)) {
            addedCircularPairs.add(pairId);
            
            console.log('🔴 Circular trading detected in selected business view:', tx.supplier_gstin, '↔️', tx.buyer_gstin);
            
            // Add only one edge to represent circular trading
            rfEdges.push({
              id: `circ-${pairId}`,
              source: tx.supplier_gstin,
              target: tx.buyer_gstin,
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#DC2626' },
              animated: true,
              label: 'CIRCULAR',
              labelStyle: { fill: '#DC2626', fontSize: 10, fontWeight: 800 },
              labelBgStyle: { fill: '#FEE2E2', fillOpacity: 0.95 },
              labelBgPadding: [6, 3],
              labelBgBorderRadius: 6,
              style: { 
                stroke: '#DC2626', 
                strokeWidth: 3.5, 
                opacity: 1 
              },
            });
          }
        }
      }
    });

    setNodes(allNodes);
    setEdges(rfEdges);
    setDisplayedTransactions(sampledTxForSpecificBusiness); // Track displayed transactions for insights
  }, [networkRaw, selectedGstin, depth, riskFilter, minAmount, statusFilter, selectedNode, setNodes, setEdges]);

  const insights = useMemo(() => {
    const nodeCount = networkRaw.nodes?.length || 0;
    // Use displayed transactions instead of all transactions for accurate metrics
    const transactions = Array.isArray(displayedTransactions) && displayedTransactions.length > 0 
      ? displayedTransactions 
      : (Array.isArray(networkRaw.edges) ? networkRaw.edges : []);
    const edgeCount = transactions.length;
    const highRisk = (networkRaw.nodes || []).filter((n) => toTone(n.riskCategory) === 'high').length;

    // Helper functions for circular trading detection
    const buildGraph = (txList) => {
      const graph = new Map();
      txList.forEach(tx => {
        if (tx.supplier_gstin && tx.buyer_gstin) {
          if (!graph.has(tx.supplier_gstin)) graph.set(tx.supplier_gstin, []);
          graph.get(tx.supplier_gstin).push(tx.buyer_gstin);
        }
      });
      return graph;
    };
    
    const findCircularNodes = (graph) => {
      const visited = new Set();
      const recStack = new Set();
      const circularNodes = new Set();
      
      const dfs = (node, path = []) => {
        if (recStack.has(node)) {
          const cycleStart = path.indexOf(node);
          if (cycleStart !== -1) {
            path.slice(cycleStart).forEach(n => circularNodes.add(n));
            circularNodes.add(node);
          }
          return true;
        }
        if (visited.has(node)) return false;
        
        visited.add(node);
        recStack.add(node);
        path.push(node);
        
        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
          dfs(neighbor, [...path]);
        }
        
        recStack.delete(node);
        return false;
      };
      
      for (const node of graph.keys()) {
        if (!visited.has(node)) {
          dfs(node);
        }
      }
      
      return circularNodes;
    };

    if (!selectedGstin) {
      // When showing all businesses (no specific selection)
      const matched = transactions.filter(tx => String(tx.status || '').toLowerCase() === 'matched').length;
      const mismatches = transactions.filter(tx => ['mismatch', 'fraud'].includes(String(tx.status || '').toLowerCase())).length;
      const partial = transactions.filter(tx => String(tx.status || '').toLowerCase() === 'partial').length;
      
      // Detect circular trading using the helper functions
      const graph = buildGraph(transactions);
      const circularNodes = findCircularNodes(graph);
      const circularRings = circularNodes.size > 0 ? Math.ceil(circularNodes.size / 3) : 0;
      
      return {
        businesses: nodeCount,
        transactions: edgeCount,
        highRisk,
        matched,
        mismatches,
        partial,
        circularRings,
        clusters: edgeCount > 0 ? Math.max(1, Math.round(nodeCount / 5)) : 0,
      };
    }

    // When a specific business is selected - use same cycle detection
    const graph = buildGraph(transactions);
    const circularNodes = findCircularNodes(graph);
    const circularRings = circularNodes.size > 0 ? Math.ceil(circularNodes.size / 3) : 0;
    
    const matched = transactions.filter(tx => String(tx.status || '').toLowerCase() === 'matched').length;
    const mismatches = transactions.filter(tx => ['mismatch', 'fraud'].includes(String(tx.status || '').toLowerCase())).length;

    return {
      businesses: nodeCount,
      transactions: edgeCount,
      highRisk,
      matched,
      mismatches,
      circularRings,
      clusters: edgeCount > 0 ? Math.max(1, Math.round(nodeCount / 5)) : 0,
    };
  }, [networkRaw, selectedGstin, displayedTransactions]);

  const applySearch = (e) => {
    e.preventDefault();
    const value = search.trim();
    if (!value) return;
    setSelectedGstin(value);
  };

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes grid-fade {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
          50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.6); }
        }
        .grid-pattern {
          background-image: 
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: grid-fade 4s ease-in-out infinite;
        }
      `}</style>

      {/* 🎨 Enhanced Header */}
      <div className="relative rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white shadow-2xl overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-30"></div>
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/40 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Supply Network Analysis</h1>
              <p className="text-sm text-white/90 mt-2 max-w-2xl leading-relaxed">
                Interactive network visualization showing business relationships with detailed transaction flows. 
                Instantly identifies circular trading, mismatches, fraud, and anomalies across the GST network.
              </p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-white/15 backdrop-blur-sm border border-white/30 rounded-xl px-5 py-3 text-sm shadow-lg hover:bg-white/20 transition-all">
              <p className="text-white/80 text-xs uppercase tracking-wide font-medium flex items-center gap-1.5">
                <span>🏢</span> Businesses
              </p>
              <p className="font-bold text-2xl mt-1">{insights.businesses}</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm border border-white/30 rounded-xl px-5 py-3 text-sm shadow-lg hover:bg-white/20 transition-all">
              <p className="text-white/80 text-xs uppercase tracking-wide font-medium flex items-center gap-1.5">
                <span>📊</span> Transactions
              </p>
              <p className="font-bold text-2xl mt-1">{insights.transactions}</p>
            </div>
            {insights.circularRings > 0 && (
              <div className="bg-red-500/30 backdrop-blur-sm border border-red-300/50 rounded-xl px-5 py-3 text-sm shadow-lg animate-pulse">
                <p className="text-white/95 text-xs uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <span>⚠️</span> Circular
                </p>
                <p className="font-bold text-2xl mt-1">{insights.circularRings}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🎛️ Enhanced Controls */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border border-blue-200 p-5 md:p-6 shadow-lg hover:shadow-xl transition-all">
        <form onSubmit={applySearch} className="flex flex-col lg:flex-row gap-4 lg:items-center">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search by GSTIN or Business Name"
              className="w-full pl-10 pr-3 py-3 rounded-xl border-2 border-teal-300 text-sm bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 focus:bg-white transition-all font-medium"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-purple-700">🟣 Depth</span>
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(d)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                    depth === d 
                      ? 'bg-gradient-to-r from-purple-500 to-purple-700 border-purple-600 text-white shadow-lg scale-105' 
                      : 'bg-white border-purple-300 text-purple-700 hover:border-purple-400 hover:bg-purple-50'
                  }`}
                >
                  {d}-hop
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-orange-700">🟠 Risk</span>
              {['all', 'high', 'medium', 'low'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskFilter(r)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                    riskFilter === r 
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 border-orange-600 text-white shadow-lg scale-105' 
                      : 'bg-white border-orange-300 text-orange-700 hover:border-orange-400 hover:bg-orange-50'
                  }`}
                >
                  {r === 'all' ? 'All' : r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-teal-700">💰 Min Value</span>
              <input
                type="number"
                min={0}
                value={minAmount}
                onChange={(e) => setMinAmount(Number(e.target.value) || 0)}
                className="w-28 px-3 py-2 rounded-lg border-2 border-teal-300 text-xs bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Apply
            </button>
          </div>
        </form>
      </div>

      {/* Graph + Insights */}
      {!isFullscreen && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* 🌐 Enhanced Graph Card */}
          <div className="xl:col-span-3 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl border-2 border-indigo-300 p-6 shadow-xl hover:shadow-2xl transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-700 to-purple-700 bg-clip-text text-transparent">Supply Network Graph</h2>
                    {statusFilter !== 'all' && (
                      <span className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 text-xs font-bold border border-indigo-300">
                        Filter: {statusFilter === 'circular' ? '🔴 Circular Trading' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2 font-medium">
                  {selectedGstin ? (
                    <>
                      Transaction network centered on <span className="font-bold text-indigo-600">{selectedGstin}</span>. 
                      Shows supplier-buyer relationships with invoice statuses.
                    </>
                  ) : (
                    <>
                      Showing <span className="font-bold text-purple-600">transaction network for top businesses</span>. 
                      Search or click a node to drill down into specific business.
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {(statusFilter !== 'all' || riskFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setStatusFilter('all');
                        setRiskFilter('all');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-800 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                      title="Clear all filters"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Filters
                    </button>
                  )}
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                    title="Toggle fullscreen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    Fullscreen
                  </button>
                </div>
                {selectedGstin && (
                  <button
                    onClick={() => {
                      setSelectedGstin('');
                      setSearch('');
                      setSelectedNode(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-800 transition-colors shadow-md"
                  >
                    ← Back to All Businesses
                  </button>
                )}
                <div className="flex flex-wrap gap-3 text-xs font-semibold text-gray-600 mt-2">
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 shadow-md" /> 🟢 Low risk</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500 shadow-md" /> 🟡 Medium</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 shadow-md" /> 🔴 High</span>
                </div>
                {insights.transactions > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-600 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-4 h-1 bg-green-500 rounded shadow-sm" /> ✅ Match
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-4 h-1 bg-red-500 rounded shadow-sm" /> ❌ Mismatch
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-4 h-1 bg-red-700 rounded shadow-sm" /> ⚠️ Fraud
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-4 h-1 bg-red-700 rounded shadow-sm animate-pulse" /> 🔄 Circular
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="relative h-[600px] mt-4 rounded-xl overflow-hidden border border-[#E5E7EB] bg-gradient-to-br from-[#F9FAFB] via-white to-[#F3F4F6]">
              {hover && (
                <div className="absolute z-10 top-3 left-3 bg-white/95 backdrop-blur-sm border border-[#E5E7EB] rounded-lg shadow-lg p-3 w-72">
                  <p className="text-sm font-semibold text-[#111827] truncate">{hover.name}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 truncate">GSTIN: {hover.gstin}</p>
                  <p className="text-xs text-[#6B7280] mt-1">Invoices: {hover.invoiceCount}</p>
                </div>
              )}

              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 1.2, minZoom: 0.3 }}
                minZoom={0.08}
                maxZoom={1.8}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                  animated: false,
                }}
                onNodeMouseEnter={(_, n) => setHover(n.data?.meta ? n.data.meta : null)}
                onNodeMouseLeave={() => setHover(null)}
                onNodeClick={(_, n) => {
                  const handler = n.data?.onClick;
                  if (typeof handler === 'function') handler();
                }}
                nodeTypes={{ entity: EntityNode }}
                style={{ background: 'transparent' }}
              >
                <Background 
                  gap={20} 
                  size={1.5}
                  color="#E5E7EB" 
                  variant="dots"
                />
                <Controls 
                  className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg"
                  showInteractive={false}
                />
                <MiniMap
                  nodeStrokeColor={(n) => {
                    if (n.data?.kind === 'fraud') return '#DC2626';
                    if (n.data?.kind === 'buyer') return '#EF4444';
                    if (n.data?.kind === 'center') return '#F59E0B';
                    return '#22C55E';
                  }}
                  nodeColor={(n) => {
                    if (n.data?.kind === 'fraud') return '#FEE2E2';
                    if (n.data?.kind === 'buyer') return '#FEE2E2';
                    if (n.data?.kind === 'center') return '#FEF3C7';
                    if (n.data?.kind === 'invoice') return '#F3F4F6';
                    return '#D1FAE5';
                  }}
                  nodeBorderRadius={8}
                  className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg"
                  maskColor="rgba(0, 0, 0, 0.05)"
                />
              </ReactFlow>
            </div>
          </div>

        {/* 📊 Enhanced Insights panel with Individual Metric Cards */}
        <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-2xl border-2 border-green-300 p-6 shadow-xl hover:shadow-2xl transition-all space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">Network Insights</h2>
              <p className="text-xs text-gray-600 mt-0.5 font-medium">
                {selectedGstin ? 'Transaction analytics for selected business' : 'High-level network overview'}
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* 🏢 Total Businesses Card */}
            <div className="bg-gradient-to-r from-blue-100 to-blue-200 border-2 border-blue-400 rounded-xl p-3 shadow-md hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                  🏢 Total businesses
                </span>
                <span className="text-xl font-bold text-blue-900">{insights.businesses}</span>
              </div>
            </div>
            
            {/* 📊 Total Transactions Card */}
            <div className="bg-gradient-to-r from-purple-100 to-purple-200 border-2 border-purple-400 rounded-xl p-3 shadow-md hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
                  📊 Total transactions
                </span>
                <span className="text-xl font-bold text-purple-900">{insights.transactions}</span>
              </div>
            </div>
            
            {/* ⚠️ High Risk Nodes Card - Clickable */}
            <button
              onClick={() => setRiskFilter(riskFilter === 'high' ? 'all' : 'high')}
              className={`w-full bg-gradient-to-r from-red-100 to-orange-200 border-2 rounded-xl p-3 shadow-md hover:shadow-lg transition-all ${
                riskFilter === 'high' ? 'border-red-500 ring-2 ring-red-300' : 'border-orange-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                  ⚠️ High risk nodes
                </span>
                <span className="text-xl font-bold text-red-900">{insights.highRisk}</span>
              </div>
            </button>
            
            {insights.transactions > 0 && (
              <>
                <div className="pt-2 border-t-2 border-green-300" />
                
                {/* ✅ Matched Invoices Card - Clickable with Pulse */}
                <button
                  onClick={() => setStatusFilter(statusFilter === 'matched' ? 'all' : 'matched')}
                  className={`w-full bg-gradient-to-r from-green-100 to-emerald-200 border-2 rounded-xl p-3 shadow-md hover:shadow-xl transition-all animate-pulse ${
                    statusFilter === 'matched' ? 'border-green-600 ring-2 ring-green-400' : 'border-green-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                      ✅ Matched invoices
                    </span>
                    <span className="text-xl font-bold text-green-900">{insights.matched || 0}</span>
                  </div>
                </button>
                
                {/* ❌ Mismatches/Fraud Card - Clickable */}
                <button
                  onClick={() => setStatusFilter(statusFilter === 'mismatch' ? 'all' : 'mismatch')}
                  className={`w-full bg-gradient-to-r from-red-100 to-rose-200 border-2 rounded-xl p-3 shadow-md hover:shadow-lg transition-all ${
                    statusFilter === 'mismatch' ? 'border-red-500 ring-2 ring-red-300' : 'border-red-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                      ❌ Mismatches / Fraud
                    </span>
                    <span className="text-xl font-bold text-red-900">{insights.mismatches || 0}</span>
                  </div>
                </button>
                
                {/* ⚡ Partial Matches Card - Clickable */}
                {insights.partial > 0 && (
                  <button
                    onClick={() => setStatusFilter(statusFilter === 'partial' ? 'all' : 'partial')}
                    className={`w-full bg-gradient-to-r from-orange-100 to-yellow-200 border-2 rounded-xl p-3 shadow-md hover:shadow-lg transition-all ${
                      statusFilter === 'partial' ? 'border-orange-500 ring-2 ring-orange-300' : 'border-orange-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-orange-800 flex items-center gap-1.5">
                        ⚡ Partial matches
                      </span>
                      <span className="text-xl font-bold text-orange-900">{insights.partial || 0}</span>
                    </div>
                  </button>
                )}
                
                <div className="pt-2 border-t-2 border-green-300" />
                
                {/* 🔄 Circular Trading Rings Card - Clickable with Animation */}
                <button
                  onClick={() => setStatusFilter(statusFilter === 'circular' ? 'all' : 'circular')}
                  className={`w-full bg-gradient-to-r from-pink-100 to-red-200 border-2 rounded-xl p-3 shadow-md hover:shadow-lg transition-all animate-pulse ${
                    statusFilter === 'circular' ? 'border-pink-600 ring-4 ring-pink-400' : 'border-pink-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-pink-900 flex items-center gap-1.5">
                      🔄 Circular trading rings
                    </span>
                    <span className="text-xl font-bold text-pink-900">{insights.circularRings}</span>
                  </div>
                </button>
                
                {selectedGstin && (
                  <div className="bg-gradient-to-r from-yellow-100 to-amber-200 border-2 border-yellow-400 rounded-xl p-3 shadow-md hover:shadow-lg transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-yellow-800 flex items-center gap-1.5">
                        🔍 Suspicious clusters
                      </span>
                      <span className="text-xl font-bold text-yellow-900">{insights.clusters}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          {insights.transactions > 0 && (
            <div className="pt-4 border-t-2 border-green-300">
              <p className="text-xs text-gray-600 font-semibold flex items-center gap-1.5 bg-white/60 rounded-lg p-2 border border-green-300">
                <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                💡 Click metrics to filter graph
              </p>
            </div>
          )}

          <div className="pt-4 border-t-2 border-green-300 space-y-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="text-lg">👤</span> Selected Business
            </h3>
            {selectedNode ? (
              <div className="text-sm bg-white/70 rounded-xl p-3 border-2 border-green-300 space-y-2">
                <p className="font-bold text-gray-900 truncate">{selectedNode.name}</p>
                <p className="text-xs text-gray-600 truncate">🆔 GSTIN: {selectedNode.gstin}</p>
                <p className="text-xs text-gray-600">📄 Invoices: {selectedNode.invoiceCount}</p>
                <button
                  className="mt-3 w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-700 text-white text-xs font-bold hover:from-indigo-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  onClick={() => navigate(`/business/${encodeURIComponent(selectedNode.gstin)}`)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Investigate Business
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-600 bg-white/60 rounded-lg p-3 border border-green-300 font-medium">
                💡 Click a node in the graph to see details and open its investigation page.
              </p>
            )}

            <div className="pt-4 border-t-2 border-green-300 text-xs text-gray-700 space-y-1.5 bg-white/60 rounded-lg p-3 border border-green-300">
              <p className="font-bold text-gray-800 flex items-center gap-1.5">
                <span className="text-base">📖</span> Legend
              </p>
              <p className="flex items-center gap-1.5">• Node color = risk level (🟢 / 🟡 / 🔴)</p>
              {insights.transactions > 0 && (
                <>
                  <p className="flex items-center gap-1.5">• 📄 Invoice nodes = transaction details</p>
                  <p className="flex items-center gap-1.5">• Edge colors = transaction status:</p>
                  <p className="pl-4 flex items-center gap-1.5">◦ Green ✅ = Matched</p>
                  <p className="pl-4 flex items-center gap-1.5">◦ Red/Orange ❌ = Mismatch/Fraud</p>
                  <p className="pl-4 flex items-center gap-1.5">◦ Animated ⚡ = Issue detected</p>
                  <p className="flex items-center gap-1.5">• Thick red animated 🔄 = Circular trading</p>
                </>
              )}
              {!selectedGstin && insights.transactions === 0 && (
                <p className="flex items-center gap-1.5">• 🔍 Search for a business to see transaction network</p>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Fullscreen Graph */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white">
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 z-20 px-4 py-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-medium transition-colors shadow-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Exit Fullscreen
          </button>
          
          {hover && (
            <div className="absolute z-10 top-3 left-3 bg-white border border-[#E5E7EB] rounded-lg shadow-lg p-3 w-72">
              <p className="text-sm font-semibold text-[#111827] truncate">{hover.name}</p>
              <p className="text-xs text-[#6B7280] mt-0.5 truncate">GSTIN: {hover.gstin}</p>
              <p className="text-xs text-[#6B7280] mt-1">Invoices: {hover.invoiceCount}</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.2, minZoom: 0.3 }}
            minZoom={0.08}
            maxZoom={1.8}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
            }}
            onNodeMouseEnter={(_, n) => setHover(n.data?.meta ? n.data.meta : null)}
            onNodeMouseLeave={() => setHover(null)}
            onNodeClick={(_, n) => {
              const handler = n.data?.onClick;
              if (typeof handler === 'function') handler();
            }}
            nodeTypes={{ entity: EntityNode }}
            style={{ background: 'linear-gradient(to bottom right, #F9FAFB, white, #F3F4F6)' }}
          >
            <Background 
              gap={20} 
              size={1.5}
              color="#E5E7EB" 
              variant="dots"
            />
            <Controls 
              className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg"
              showInteractive={false}
            />
            <MiniMap
              nodeStrokeColor={(n) => {
                if (n.data?.kind === 'fraud') return '#DC2626';
                if (n.data?.kind === 'buyer') return '#EF4444';
                if (n.data?.kind === 'center') return '#F59E0B';
                return '#22C55E';
              }}
              nodeColor={(n) => {
                if (n.data?.kind === 'fraud') return '#FEE2E2';
                if (n.data?.kind === 'buyer') return '#FEE2E2';
                if (n.data?.kind === 'center') return '#FEF3C7';
                if (n.data?.kind === 'invoice') return '#F3F4F6';
                return '#D1FAE5';
              }}
              nodeBorderRadius={8}
              className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg"
              maskColor="rgba(0, 0, 0, 0.05)"
            />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
