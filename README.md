# 🌍 GlebasGEO - Validador Geoespacial de Glebas 


Sistema web moderno e responsivo para validação de glebas georreferenciadas. Integra visualização em mapa interativo, importação de dados geoespaciais (Excel, GeoJSON) e validação de coordenadas conforme normas SICOR.

<img width="1431" height="773" alt="image" src="https://github.com/user-attachments/assets/7014e483-2d46-4ab8-a2dc-364197f87583" />

---

## ✨ Características

- 🗺️ **Mapa Interativo** - Visualização em tempo real com Leaflet.js
- 📊 **Dashboard de Validação** - Resumo com estatísticas de glebas (válidas, inválidas, pendentes)
- 📥 **Importação de Dados** - Suporta Excel (.xlsx), CSV e GeoJSON
- ✅ **Validação Geoespacial** - Verificação de coordenadas, geometrias e conformidade SICOR
- 🔍 **Busca e Filtros** - Filtrar glebas por municipio, estado de validação, etc
- 📋 **Detalhes da Gleba** - Painel lateral com informações técnicas e geoespaciais
- 📤 **Exportação de Relatórios** - Gerar relatórios de validação
- 🌙 **Dark Theme** - Interface moderna com tema escuro e design responsivo

---

## 🚀 Quick Start

### Pré-requisitos
- **Node.js** 16+ 
- **npm** ou **yarn**

### Instalação

```bash
# Clone o repositório
git clone https://github.com/Rodrigo-dev7/glebasGeo.git
cd glebasGeo

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse em `http://localhost:5173`

### Build para Produção

```bash
npm run build    # Gera pasta /dist
npm run preview  # Visualiza build local
```

---

## 📁 Estrutura do Projeto

```
src/
├── components/                         # Componentes React
│   ├── Sidebar.jsx                     # Painel lateral com resumo
│   ├── MapView.jsx                     # Mapa Leaflet interativo
│   ├── FilterBar.jsx                   # Barra de filtros
│   ├── GlebaAccordionList.jsx          # Lista accordion de glebas
│   ├── GlebaDetailModal.jsx            # Modal com detalhes
│   ├── GlebaPanel.jsx                  # Painel de gleba selecionada
│   ├── CoordinateValidationPanel.jsx   # Importação e validação
│   └── Legend.jsx                      # Legenda do mapa
│
├── hooks/                              # Custom React hooks
│   └── useGlebas.js                    # Hook central de estado
│
├── services/                           # Serviços e lógica de negócio
│   ├── validationService.js            # Validação de geometrias
│   ├── coordinateValidationService.js  # Validação de coordenadas
│   ├── sicorGlebaValidationService.js  # Regras SICOR específicas
│   ├── excelGeoService.js              # Leitura de Excel/GeoJSON
│   ├── datasetImportService.js         # Pipeline de importação
│   ├── featureGeometryService.js       # Processamento geométrico
│   ├── glebaEnrichmentService.js       # Enriquecimento de dados
│   ├── adminBoundaryService.js         # Limites administrativos
│   └── reportService.js                # Geração de relatórios
│
└── data/                               # Dados estáticos
    ├── glebas.json                     # Dataset inicial
    └── municipios-uf.json              # Dados municipais
```

---

## 🛠️ Tecnologias Utilizadas

- **React 18** - UI Framework
- **Vite** - Build tool ultrarrápido
- **Leaflet.js** - Mapa interativo
- **Turf.js** - Análise geoespacial
- **CSS3** - Styling com dark theme

---

## 👨‍💻 Autor

**Rodrigo Dev** - [@Rodrigo-dev7](https://github.com/Rodrigo-dev7)

---

**GlebasGEO** © 2026 - Sistema de Validação Geoespacial 
