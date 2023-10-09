import streamlit as st
import pandas as pd
import base64
import math
from streamlit_echarts import st_echarts, JsCode
from st_pages import show_pages_from_config
import json

show_pages_from_config()

st.set_page_config(layout="wide")

# Reading the dictionary from the text file
with open('colors.txt', 'r') as file:
    COLORS = json.load(file)

# Initialize st.session_state for the selected year
if "selected_year" not in st.session_state:
    st.session_state.selected_year = None

def main():
    st.sidebar.title('Power Generation Visualization')

    category_name = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
        index=0
    )

    df, df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_option(df_7mean, category_name)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")

    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    # 在侧边栏上显示图例
    st.sidebar.subheader("Legend: Year Colors")
    for year, color in colors_for_years.items():
        if st.sidebar.button(f"{year}", key=f"year_{year}"):
            st.session_state.selected_year = year if st.session_state.selected_year != year else None
        st.sidebar.markdown(f"<span style='color: {color};'>■</span> {year}", unsafe_allow_html=True)

    if category_name == 'total':
        csv_data = df[df['type'] != 'total'].to_csv(index=False)
    else:
        csv_data = df[df['type'] == category_name].to_csv(index=False)
    st.sidebar.download_button(
        label=f"Download {category_name} Data as CSV",
        data=csv_data,
        file_name=f"{category_name}_data.csv",
        mime="text/csv"
    )

def generate_grid_option(df_7mean, category_name):
    countries = df_7mean['country'].unique().tolist()
    num_countries = len(countries)

    COLS = 4
    ROWS = int(math.ceil(num_countries / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 100 / ROWS

    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 250

    WIDTH_ADJUSTMENT = 0.8
    HEIGHT_ADJUSTMENT = 2.5

    formatted_dates = df_7mean['date'].dt.strftime('%b-%d').drop_duplicates().tolist()

    option = {
        "tooltip": {
            "trigger": "axis"
        },
        "xAxis": [],
        "yAxis": [],
        "grid": [],
        "series": []
    }

    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    for idx, country in enumerate(countries):
        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 2 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        country_data = df_7mean[df_7mean['country'] == country]
        min_val = float(round(country_data[country_data['type'] == category_name]['value'].min() * 0.95))
        max_val = float(round(country_data[country_data['type'] == category_name]['value'].max() * 1.05))

        option["xAxis"].append({
            "gridIndex": idx,
            "type": "category",
            "data": formatted_dates,
        })

        option["yAxis"].append({
            "gridIndex": idx,
            "type": "value",
            "min": min_val,
            "max": max_val,
            "name": country,
            "nameTextStyle": {
                "fontSize": 14,
                "fontWeight": "bold",
                "padding": [0, 0, 0, 200]
            }
        })

        unique_years = country_data['year'].unique()
        for year in unique_years:
            opacity_val = 0.2
            if st.session_state.selected_year:
                if year == st.session_state.selected_year:
                    opacity_val = 1
                else:
                    opacity_val = 0.1

            year_data = country_data[country_data['year'] == year]
            option["series"].append({
                "name": f"{country} {year}",
                "type": "line",
                "xAxisIndex": idx,
                "yAxisIndex": idx,
                "data": year_data[year_data['type'] == category_name]['value'].tolist(),
                "itemStyle": {
                    "color": colors_for_years[year],
                    "opacity": opacity_val
                },
                "emphasis": {
                    "lineStyle": {
                        "width": 4
                    },
                    "itemStyle": {
                        "opacity": 1
                    }
                },
                "selectedMode": "single",
            })

    return option, ROWS_PER_GRID, PLOT_HEIGHT

@st.cache_data
def data_read():
    df = pd.read_csv('./data/data_for_download.csv')
    df_7mean = pd.read_csv('./data/data_for_line_chart.csv')

    df['date'] = pd.to_datetime(df['date'])
    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df, df_7mean

def get_csv_download_link(df, filename="data.csv"):
    csv = df.to_csv(index=False)
    b64 = base64.b64encode(csv.encode()).decode()
    href = f'<a href="data:file/csv;base64,{b64}" download="{filename}">下载 CSV 文件</a>'
    return href

def get_line_colors(num_years, category_name):
    base_grey = 200
    decrement = 15

    colors = []

    for _ in range(num_years - 1):
        rgb_color = f'rgb({base_grey},{base_grey},{base_grey})'
        colors.append(rgb_color)
        base_grey = max(50, base_grey - decrement)

    colors.append(COLORS.get(category_name, 'rgb(220,20,60)'))

    return colors

if __name__ == '__main__':
    main()
