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


# 主程序
def main():
    st.sidebar.title('Power Generation Visualization')

    category_name = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
        index=0  # 将默认值设置为'power'
    )

    df, df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_option(df_7mean, category_name)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")

    # 获取颜色信息
    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    # 在侧边栏上显示图例
    st.sidebar.subheader("Legend: Year Colors")
    for year, color in colors_for_years.items():
        st.sidebar.markdown(f"<span style='color: {color};'>■</span> {year}", unsafe_allow_html=True)

    # 使用 Streamlit 的下载按钮进行一键下载
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


# 生成 ECharts 配置的函数
def generate_grid_option(df_7mean, category_name):
    # 获取所有国家
    countries = df_7mean['country'].unique().tolist()
    num_countries = len(countries)

    # 定义全局设置
    # 动态计算行数和列数
    COLS = 4

    # 计算所需的行数以容纳所有国家，每行4列
    ROWS = int(math.ceil(num_countries / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 100 / ROWS

    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 250  # 根据需要进行调整

    # 调整间距
    WIDTH_ADJUSTMENT = 0.8  # 增加或减少以调整水平间距
    HEIGHT_ADJUSTMENT = 2.5  # 增加或减少以调整垂直间距

    # 格式化日期以用于 x 轴
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

    # 创建存储每年颜色的字典
    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    # 创建图表的网格
    for idx, country in enumerate(countries):

        # 创建网格并进行间距调整
        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 2 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        # 过滤当前国家的数据
        country_data = df_7mean[df_7mean['country'] == country]
        min_val = float(round(country_data[country_data['type'] == category_name]['value'].min() * 0.95))
        max_val = float(round(country_data[country_data['type'] == category_name]['value'].max() * 1.05))

        # 为网格创建 x 和 y 轴
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
                "fontSize": 14,  # 根据需要进行调整
                "fontWeight": "bold",
                "padding": [0, 0, 0, 200]  # 如果需要，添加一些填充。[上，右，下，左]
            }
        })

        # 为每年生成系列数据
        unique_years = country_data['year'].unique()
        for year in unique_years:
            year_data = country_data[country_data['year'] == year]
            option["series"].append({
                "name": f"{country} {year}",
                "type": "line",
                "xAxisIndex": idx,
                "yAxisIndex": idx,
                "data": year_data[year_data['type'] == category_name]['value'].tolist(),
                "itemStyle": {
                    "color": colors_for_years[year],
                    "opacity": 0.2  # default opacity for all lines
                },
                "emphasis": {  # Add this block for emphasis styling
                    "lineStyle": {
                        "width": 4
                    },
                    "itemStyle": {
                        "opacity": 1
                    }
                },
                "selectedMode": "single",  # Add this line to allow single line selection
            })

    return option, ROWS_PER_GRID, PLOT_HEIGHT


# 数据处理函数，通过 st.cache_data 进行缓存
@st.cache_data
def data_read():
    df = pd.read_csv('./data/data_for_download.csv')
    df_7mean = pd.read_csv('./data/data_for_line_chart.csv')

    df['date'] = pd.to_datetime(df['date'])
    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df, df_7mean


# 获取 CSV 下载链接的辅助函数
def get_csv_download_link(df, filename="data.csv"):
    csv = df.to_csv(index=False)
    b64 = base64.b64encode(csv.encode()).decode()
    href = f'<a href="data:file/csv;base64,{b64}" download="{filename}">下载 CSV 文件</a>'
    return href


# 获取线条颜色的辅助函数
def get_line_colors(num_years, category_name):
    base_grey = 200  # Starting from RGB(200, 200, 200), which is light grey
    decrement = 15  # Decrease to darken the color, decrementing by 15 each year

    colors = []

    # Create a color palette for each year prior to the latest year
    for _ in range(num_years - 1):
        rgb_color = f'rgb({base_grey},{base_grey},{base_grey})'
        colors.append(rgb_color)
        base_grey = max(50, base_grey - decrement)  # Don't go too dark, stop at RGB(50, 50, 50)

    # Add color for the latest year
    colors.append(COLORS.get(category_name, 'rgb(220,20,60)'))  # Use color from COLORS dict or fallback to deep red

    return colors



if __name__ == '__main__':
    main()